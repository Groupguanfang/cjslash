import type { CjslashResult } from '@cjslash/protocol'
import type { Cjslash, CjslashExecuteOptions } from 'cjslash'
import type { Plugin } from 'vitepress'
import type { CjslashVitePressTransformer, VitePluginCjslashOptions, VitePressPluginCjslashOptions } from './types'
import { cangjieLanguage, ShikiTwoslashError } from '@cjslash/shiki'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createCjslasher } from 'cjslash'
import MarkdownIt from 'markdown-it'
import { createMarkdownRenderer, loadEnv } from 'vitepress'

const RE_CJSLASH = /\bcjslash\b/
const VIRTUAL_THEME_ID = '\0cjslash:theme'

/**
 * Create a VitePress Shiki transformer backed by asynchronously prepared Cangjie results.
 *
 * Use this lower-level API when managing the analyzer and highlighting manually.
 * `vitePluginCjslash` configures the complete integration automatically.
 * The supplied analyzer remains owned by its caller.
 *
 * ---
 *
 * 创建使用异步准备的仓颉分析结果的 VitePress Shiki transformer。
 *
 * 在需要手动管理分析器与高亮时使用此底层 API。
 * `vitePluginCjslash` 会自动配置完整集成。
 * 传入的分析器仍归调用方持有。
 */
export function transformerCjslash(options: VitePressPluginCjslashOptions): CjslashVitePressTransformer {
  const { cjslasher, cjslashOptions = {}, allowUnprepared = false, processHoverInfo, ...transformerOptions } = options
  const { signal: _signal, filterNode: _filterNode, shouldGetHoverInfo: _shouldGetHoverInfo, ...cloneableOptions } = cjslashOptions
  const executeOptions = {
    ...cjslashOptions,
    ...structuredClone(cloneableOptions),
  }
  const langs = transformerOptions.langs ?? ['cj']
  const langAlias: Record<string, string> = {
    cangjie: 'cj',
    Cangjie: 'cj',
    ...transformerOptions.langAlias,
  }
  const explicitTrigger = normalizeExplicitTrigger(transformerOptions.explicitTrigger)
  const trigger = explicitTrigger instanceof RegExp
    ? explicitTrigger
    : RE_CJSLASH
  const disableTriggers = transformerOptions.disableTriggers ?? ['nocjslash', 'no-cjslash']
  const filter = transformerOptions.filter
  const preparedResults = new Map<string, CjslashResult>()
  const preparationErrors = new Map<string, unknown>()
  const preparations = new Map<string, Promise<CjslashResult>>()
  const markdown = new MarkdownIt()

  /**
   * Read a prepared result synchronously for the upstream transformer.
   *
   * ---
   *
   * 为上游 transformer 同步读取已准备的分析结果。
   */
  function readPreparedResult(code: string): CjslashResult {
    const result = preparedResults.get(code)
    if (result) return result
    if (preparationErrors.has(code)) throw preparationErrors.get(code)
    throw new ShikiTwoslashError('Cangjie source has not been prepared. Call await transformer.prepare(code) with the exact original source before highlighting.')
  }

  /**
   * Prepare one original source and share concurrent analysis work.
   *
   * ---
   *
   * 准备一份原始源码，并共享并发的分析任务。
   */
  function prepare(code: string): Promise<CjslashResult> {
    const result = preparedResults.get(code)
    if (result) return Promise.resolve(result)
    let pending = preparations.get(code)
    if (!pending) {
      preparationErrors.delete(code)
      pending = Promise.resolve()
        .then((): Promise<CjslashResult> => cjslasher(code, 'cj', executeOptions))
        .then((result): CjslashResult => {
          preparedResults.set(code, result)
          return result
        }, (error: unknown): never => {
          preparationErrors.set(code, error)
          throw error
        })
        .finally((): void => {
          preparations.delete(code)
        })
      preparations.set(code, pending)
    }
    return pending
  }

  /**
   * Prepare Markdown fences before synchronous highlighting.
   *
   * Custom filters run upstream with the full Shiki context during rendering.
   * When provided, all fences are prepared so context-dependent filters work.
   *
   * ---
   *
   * 在同步高亮前准备 Markdown 围栏。
   *
   * 自定义筛选器在上游渲染阶段使用完整 Shiki 上下文执行。
   * 提供自定义筛选器时会准备所有围栏，以支持依赖上下文的筛选逻辑。
   */
  async function prepareMarkdown(source: string): Promise<void> {
    const tasks: Promise<CjslashResult>[] = []
    for (const token of markdown.parse(source, {})) {
      if (token.type !== 'fence') continue
      const match = /^[\w-]+/.exec(token.info)
      const lang = match?.[0].toLowerCase() ?? ''
      const attrs = token.info.slice(match?.[0].length ?? 0).replace(/(?<!=)\{/g, ' {').trim().replace(/\s+/g, ' ')
      const aliased = langAlias[lang] ?? lang
      if (!filter && (
        !langs.includes(aliased)
        || (explicitTrigger && attrs.search(trigger) === -1)
        || disableTriggers.some(disableTrigger => typeof disableTrigger === 'string'
          ? attrs.includes(disableTrigger)
          : attrs.search(disableTrigger) !== -1)
      )) {
        continue
      }
      tasks.push(prepare(token.content.trimEnd()))
    }
    await Promise.allSettled(tasks)
  }

  const transformer = transformerTwoslash({
    ...transformerOptions,
    langs,
    langAlias,
    explicitTrigger,
    disableTriggers,
    processHoverInfo: processHoverInfo ?? preserveHoverInfo,
    twoslasher: readPreparedResult,
  })
  if (allowUnprepared) {
    const upstreamPreprocess = transformer.preprocess
    transformer.preprocess = function (code, options): string | void {
      if (!preparedResults.has(code) && !preparationErrors.has(code)) return
      return upstreamPreprocess?.call(this, code, options)
    }
  }

  return {
    ...transformer,
    name: '@cjslash/vitepress',
    prepare,
    prepareMarkdown,
  }
}

/**
 * Normalize upstream trigger settings while using `cjslash` for boolean opt-in.
 *
 * ---
 *
 * 规范化上游触发配置，并在布尔值启用时使用 `cjslash`。
 */
function normalizeExplicitTrigger(trigger: boolean | RegExp | undefined): boolean | RegExp {
  if (trigger === false) return false
  if (trigger instanceof RegExp) return trigger
  return RE_CJSLASH
}

/**
 * Install Cangjie highlighting, asynchronous analysis, and the shared client.
 *
 * Add `vitePluginCjslash({ sdkPath })` to VitePress's `vite.plugins`. The plugin
 * registers the grammar and transformer, prepares Markdown before rendering,
 * and disposes its lazily created analyzer when a build or server closes.
 * Unprepared renders, including search indexing, use static highlighting by default.
 * An existing transformer can also be supplied without transferring its ownership
 * or automatically installing the client.
 *
 * ---
 *
 * 安装仓颉高亮、异步分析与共用客户端。
 *
 * 将 `vitePluginCjslash({ sdkPath })` 放进 VitePress 的 `vite.plugins`。
 * 插件会注册语法与 transformer，在渲染前准备 Markdown，
 * 并在构建或服务器关闭时释放按需创建的分析器。
 * 未准备的渲染（包括搜索索引）默认使用静态高亮。
 * 也可以传入现有 transformer，其所有权不会转移，客户端也不会自动安装。
 */
export function vitePluginCjslash(options?: VitePluginCjslashOptions): Plugin
export function vitePluginCjslash(transformer: CjslashVitePressTransformer): Plugin
export function vitePluginCjslash(options: VitePluginCjslashOptions | CjslashVitePressTransformer = {}): Plugin {
  const existing = 'prepareMarkdown' in options
    ? options
    : undefined
  const { sdkPath: configuredSdkPath, workspaceRoot, platform, arch, cjpmToml, autoInstallDependencies, timeout, cjslasher, injectClient = !existing, ...transformerOptions } = existing
    ? {}
    : options as VitePluginCjslashOptions
  let sdkPath = configuredSdkPath
  let enabled = !!(existing || cjslasher || sdkPath)
  let analyzer: Promise<Cjslash> | undefined
  let themeEntry: string | undefined
  const transformer = existing ?? transformerCjslash({
    ...transformerOptions,
    allowUnprepared: transformerOptions.allowUnprepared ?? true,
    cjslasher: cjslasher ?? analyze,
  })

  /**
   * Analyze a source with an analyzer owned by this plugin.
   *
   * ---
   *
   * 使用本插件持有的分析器分析源码。
   */
  async function analyze(code: string, extension?: 'cj', executeOptions?: CjslashExecuteOptions): Promise<CjslashResult> {
    analyzer ??= createCjslasher({
      sdkPath: sdkPath!,
      workspaceRoot,
      platform,
      arch,
      cjpmToml,
      autoInstallDependencies,
      timeout,
    })
    return (await analyzer).analyze(code, extension, executeOptions)
  }

  /**
   * Dispose the owned analyzer while allowing the next build phase to recreate it.
   *
   * Failed initialization has no analyzer to dispose. Borrowed analyzers are
   * never disposed by this plugin.
   *
   * ---
   *
   * 释放插件持有的分析器，并允许后续构建阶段重新创建。
   *
   * 初始化失败时没有需要释放的分析器。插件不会释放借用的分析器。
   */
  async function dispose(): Promise<void> {
    const current = analyzer
    analyzer = undefined
    const cjslasher = await current?.catch((): undefined => undefined)
    await cjslasher?.[Symbol.asyncDispose]()
  }

  return {
    name: '@cjslash/vitepress',
    enforce: 'pre',
    config: {
      order: 'post',
      /**
       * Configure the public Markdown renderer before VitePress caches it.
       *
       * VitePress captures its Markdown options before Vite hooks run. Preparing
       * its shared renderer here also supports sites without a `markdown` object.
       * Locale options follow VitePress's merge order.
       *
       * ---
       *
       * 在 VitePress 缓存 Markdown 渲染器前配置其公开的渲染 API。
       *
       * VitePress 在 Vite 钩子执行前捕获 Markdown 配置。在这里准备共用渲染器，
       * 也能支持未声明 `markdown` 对象的站点。语言配置遵循 VitePress 的合并顺序。
       */
      async handler(config, environment): Promise<void> {
        const siteConfig = config.vitepress
        if (!siteConfig) throw new Error('Use vitePluginCjslash in the vite.plugins option of a VitePress configuration.')
        const env = loadEnv(environment.mode, config.envDir ?? siteConfig.root, ['CJSLASH_', 'CANGJIE_'])
        sdkPath = configuredSdkPath ?? (env.CJSLASH_SDK_PATH || env.CANGJIE_HOME)
        enabled = !!(existing || cjslasher || sdkPath)
        themeEntry = `${siteConfig.themeDir}/index`
        const markdown = siteConfig.markdown ??= {}
        const languages = markdown.languages ??= []
        if (!languages.some(language => typeof language === 'object' && 'name' in language && language.name === cangjieLanguage.name)) languages.push(cangjieLanguage)
        if (enabled) {
          const transformers = markdown.codeTransformers ??= []
          if (!transformers.includes(transformer)) transformers.push(transformer)
        }
        const locales = { ...markdown.locales }
        for (const [locale, options] of Object.entries(siteConfig.site.locales)) {
          if (options.markdown) {
            locales[locale] = {
              ...locales[locale],
              ...options.markdown,
            }
          }
        }
        await createMarkdownRenderer(siteConfig.srcDir, { ...markdown, locales }, siteConfig.site.base, siteConfig.logger, siteConfig.publicDir)
      },
    },
    /**
     * Wrap the theme entry when automatic client installation is enabled.
     *
     * ---
     *
     * 启用自动安装客户端时包装主题入口。
     */
    resolveId(id: string): string | undefined {
      if (injectClient && themeEntry && id === '@theme/index') return VIRTUAL_THEME_ID
    },
    /**
     * Preserve the theme while installing the upstream client and stylesheet.
     *
     * Load the shared stylesheet before the theme so site overrides win.
     *
     * ---
     *
     * 保留原有主题，并安装上游客户端与样式。
     *
     * 共用样式先于主题加载，以便站点样式覆盖。
     */
    load(id: string): string | undefined {
      if (id !== VIRTUAL_THEME_ID || !injectClient || !themeEntry) return
      const entry = JSON.stringify(themeEntry)
      return [
        'import "@cjslash/vitepress/style.css"',
        'import CjslashFloatingVue from "@cjslash/vitepress/client"',
        `import theme from ${entry}`,
        `export * from ${entry}`,
        'export default {',
        '  ...theme,',
        '  enhanceApp(context) {',
        '    context.app.use(CjslashFloatingVue)',
        '    return theme.enhanceApp?.(context)',
        '  },',
        '}',
      ].join('\n')
    },
    /**
     * Prepare matching Markdown modules before VitePress transforms them.
     *
     * ---
     *
     * 在 VitePress 转换前准备匹配的 Markdown 模块。
     */
    async transform(code: string, id: string): Promise<void> {
      if (!enabled || !id.split('?')[0].endsWith('.md') || id.includes('/node_modules/')) return
      await transformer.prepareMarkdown(code)
    },
    closeBundle: dispose,
    closeWatcher: dispose,
  }
}

/**
 * Preserve Cangjie signatures without TypeScript-specific rewriting.
 *
 * ---
 *
 * 保留仓颉签名，不执行 TypeScript 特有的改写。
 */
function preserveHoverInfo(info: string): string {
  return info
}

export { cangjieLanguage }
export type { CjslashVitePressTransformer, VitePluginCjslashOptions, VitePressPluginCjslashOptions } from './types'
export { ShikiTwoslashError } from '@cjslash/shiki'
export { rendererFloatingVue } from '@shikijs/vitepress-twoslash'
export type { TwoslashFloatingVueOptions, TwoslashFloatingVueRendererOptions } from '@shikijs/vitepress-twoslash'
