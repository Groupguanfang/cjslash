import type { Cjslash } from 'cjslash'
import type { MarkdownOptions, Plugin, SiteConfig } from 'vitepress'
import { createCjslasher } from 'cjslash'
import { createMarkdownRenderer, disposeMdItInstance, resolveConfig } from 'vitepress'
import { URI, Utils } from 'vscode-uri'
import { cangjieLanguage, vitePluginCjslash } from '../src/index'
import { createResult } from './helpers'

vi.mock('cjslash', (): object => ({
  createCjslasher: vi.fn(),
}))

const directory = Utils.dirname(URI.parse(import.meta.url))
const code = 'let answer = 42'
const source = `\`\`\`cj cjslash\n${code}\n\`\`\``

beforeEach((): void => {
  vi.stubEnv('CJSLASH_SDK_PATH', '')
  vi.stubEnv('CANGJIE_HOME', '')
  vi.mocked(createCjslasher).mockReset()
})

afterEach((): void => {
  disposeMdItInstance()
  vi.unstubAllEnvs()
})

describe('automatic VitePress integration', (): void => {
  it('configures an otherwise empty Markdown renderer and borrows an analyzer', async (): Promise<void> => {
    const analyzer = createAnalyzer()
    const plugin = vitePluginCjslash({ cjslasher: analyzer.analyze })
    const config = await configure(plugin)
    const markdown = await createMarkdownRenderer(config.srcDir)
    expect(await markdown.renderAsync(source)).not.toContain('twoslash lsp')
    await transform(plugin, source)
    expect(await markdown.renderAsync(source)).toContain('twoslash lsp')
    expect(createCjslasher).not.toHaveBeenCalled()
    await close(plugin, 'closeBundle')
    await close(plugin, 'closeWatcher')
    expect(analyzer[Symbol.asyncDispose]).not.toHaveBeenCalled()
  })

  it('preserves existing transformers, languages, and locale configuration', async (): Promise<void> => {
    const analyzer = createAnalyzer()
    const plugin = vitePluginCjslash({ cjslasher: analyzer.analyze })
    const options: MarkdownOptions = {
      theme: 'monokai',
      languages: [cangjieLanguage],
      codeTransformers: [
        {
          /**
           * Mark rendered blocks to verify the existing transformer is retained.
           *
           * ---
           *
           * 标记渲染的代码块，以验证现有 transformer 被保留。
           */
          pre(element): void {
            element.properties['data-existing'] = 'retained'
          },
        },
      ],
      locales: {
        root: {
          container: {
            tipLabel: 'Original tip',
          },
        },
      },
    }
    const config = await configure(plugin, options, {
      root: {
        label: '简体中文',
        markdown: {
          container: {
            tipLabel: '站点提示',
          },
        },
      },
    })
    await configure(plugin, options)
    const markdown = await createMarkdownRenderer(config.srcDir)
    await transform(plugin, source)
    const html = await markdown.renderAsync(`${source}\n\n::: tip\nText\n:::`, { localeIndex: 'root' })
    expect(html).toContain('twoslash lsp')
    expect(html).toContain('data-existing="retained"')
    expect(html).toContain('站点提示')
    expect(options.languages).toHaveLength(1)
    expect(analyzer.analyze).toHaveBeenCalledOnce()
  })

  it('keeps unconfigured sites usable with static Cangjie highlighting', async (): Promise<void> => {
    const plugin = vitePluginCjslash()
    const config = await configure(plugin)
    await transform(plugin, source)
    const markdown = await createMarkdownRenderer(config.srcDir)
    const html = await markdown.renderAsync(source)
    expect(html).toContain('shiki')
    expect(html).toContain('answer')
    expect(html).not.toContain('twoslash lsp')
    expect(html).not.toContain('language-text')
    expect(createCjslasher).not.toHaveBeenCalled()
    await close(plugin, 'closeBundle')
  })

  it('uses the client proxy with site styles taking precedence and supports opting out', async (): Promise<void> => {
    const plugin = vitePluginCjslash()
    const config = await configure(plugin)
    if (typeof plugin.resolveId !== 'function' || typeof plugin.load !== 'function') throw new TypeError('Expected function resolveId and load hooks.')
    const resolveId = plugin.resolveId as (id: string) => string | undefined
    const load = plugin.load as (id: string) => string | undefined
    const id = resolveId('@theme/index')
    expect(id).toBeDefined()
    const proxy = load(id!)!
    expect(proxy).toContain('context.app.use(CjslashFloatingVue)')
    expect(proxy).toContain('theme.enhanceApp?.(context)')
    expect(proxy).toContain(`export * from ${JSON.stringify(`${config.themeDir}/index`)}`)
    expect(proxy.indexOf('@cjslash/vitepress/style.css')).toBeLessThan(proxy.indexOf('import theme'))
    expect(resolveId('vue')).toBeUndefined()
    expect(load('/docs/example.md')).toBeUndefined()
    const manual = vitePluginCjslash({ injectClient: false })
    await configure(manual)
    expect((manual.resolveId as typeof resolveId)('@theme/index')).toBeUndefined()
    expect((manual.load as typeof load)(id!)).toBeUndefined()
  })

  it('rejects configuration outside VitePress with an actionable error', async (): Promise<void> => {
    const plugin = vitePluginCjslash()
    if (typeof plugin.config !== 'object') throw new TypeError('Expected an ordered config hook.')
    await expect(plugin.config.handler.call({} as never, {}, { command: 'build', mode: 'test' })).rejects.toThrow('vite.plugins')
  })
})

describe('owned analyzer lifecycle', (): void => {
  it.each([
    ['/explicit/sdk', '/environment/sdk', '/explicit/sdk'],
    [undefined, '/environment/sdk', '/environment/sdk'],
    [undefined, '', '/fallback/sdk'],
  ])('resolves SDK %s against CJSLASH_SDK_PATH %s', async (sdkPath, environmentPath, expected): Promise<void> => {
    vi.stubEnv('CJSLASH_SDK_PATH', environmentPath)
    vi.stubEnv('CANGJIE_HOME', '/fallback/sdk')
    const analyzer = createAnalyzer()
    vi.mocked(createCjslasher).mockResolvedValue(analyzer)
    const cjpmToml = {
      dependencies: { stdx: '1.0.0' },
    }
    const plugin = vitePluginCjslash({
      sdkPath,
      workspaceRoot: './.cjslash',
      autoInstallDependencies: false,
      timeout: 1_000,
      cjpmToml,
    })
    await configure(plugin)
    await transform(plugin, '```cj\nlet ordinary = 1\n```')
    await transform(plugin, source, '/docs/example.ts')
    expect(createCjslasher).not.toHaveBeenCalled()
    await Promise.all([
      transform(plugin, source),
      transform(plugin, source, '/docs/other.md'),
    ])
    expect(createCjslasher).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      sdkPath: expected,
      workspaceRoot: './.cjslash',
      autoInstallDependencies: false,
      timeout: 1_000,
      cjpmToml,
    }))
    expect(analyzer.analyze).toHaveBeenCalledOnce()
    await close(plugin, 'closeBundle')
    await close(plugin, 'closeWatcher')
    expect(analyzer[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('recreates the analyzer for changed sources in the next build phase', async (): Promise<void> => {
    const first = createAnalyzer()
    const second = createAnalyzer()
    vi.mocked(createCjslasher).mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const plugin = vitePluginCjslash({ sdkPath: '/sdk' })
    const config = await configure(plugin)
    await transform(plugin, source)
    await close(plugin, 'closeBundle')
    const markdown = await createMarkdownRenderer(config.srcDir)
    expect(await markdown.renderAsync(source)).toContain('twoslash lsp')
    await transform(plugin, '```cj cjslash\nlet changed = 1\n```')
    await close(plugin, 'closeWatcher')
    expect(createCjslasher).toHaveBeenCalledTimes(2)
    expect(first[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(second[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('waits for pending initialization before disposing the owned analyzer', async (): Promise<void> => {
    const pending = Promise.withResolvers<Cjslash>()
    const analyzer = createAnalyzer()
    vi.mocked(createCjslasher).mockReturnValue(pending.promise)
    const plugin = vitePluginCjslash({ sdkPath: '/sdk' })
    await configure(plugin)
    const preparation = transform(plugin, source)
    await vi.waitFor((): void => expect(createCjslasher).toHaveBeenCalledOnce())
    const shutdown = close(plugin, 'closeBundle')
    pending.resolve(analyzer)
    await Promise.all([preparation, shutdown])
    expect(analyzer[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('leaves initialization failures to rendering and still closes cleanly', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {})
    const error = new Error('Cannot initialize SDK')
    vi.mocked(createCjslasher).mockRejectedValue(error)
    const onTwoslashError = vi.fn((): void => {})
    const plugin = vitePluginCjslash({ sdkPath: '/sdk', throws: false, onTwoslashError })
    const config = await configure(plugin)
    await transform(plugin, source)
    const markdown = await createMarkdownRenderer(config.srcDir)
    expect(await markdown.renderAsync(source)).not.toContain('twoslash lsp')
    expect(onTwoslashError).toHaveBeenCalledWith(error, code, 'cj', expect.anything())
    await expect(close(plugin, 'closeBundle')).resolves.toBeUndefined()
  })
})

/**
 * Create an analyzer fixture with observable analysis and disposal.
 *
 * ---
 *
 * 创建可观察分析与释放行为的分析器夹具。
 */
function createAnalyzer(): Cjslash {
  return {
    options: { sdkPath: '/sdk' },
    analyze: vi.fn<Cjslash['analyze']>().mockImplementation(async (code): Promise<ReturnType<typeof createResult>> => createResult(code)),
    [Symbol.asyncDispose]: vi.fn<Cjslash[typeof Symbol.asyncDispose]>().mockResolvedValue(undefined),
  }
}

/**
 * Run the ordered config hook with an actual resolved VitePress configuration.
 *
 * ---
 *
 * 使用真实解析的 VitePress 配置运行有序的配置钩子。
 */
async function configure(plugin: Plugin, markdown?: MarkdownOptions, locales?: SiteConfig['site']['locales']): Promise<SiteConfig> {
  const config = await resolveConfig(directory.fsPath, 'build', 'test')
  config.markdown = markdown
  if (locales) config.site.locales = locales
  if (typeof plugin.config !== 'object') throw new TypeError('Expected an ordered config hook.')
  await plugin.config.handler.call({} as never, { vitepress: config }, { command: 'build', mode: 'test' })
  return config
}

/**
 * Prepare a Markdown module through the public Vite hook.
 *
 * ---
 *
 * 通过公开的 Vite 钩子准备 Markdown 模块。
 */
async function transform(plugin: Plugin, code: string, id = '/docs/example.md'): Promise<void> {
  if (typeof plugin.transform !== 'function') throw new TypeError('Expected a function transform hook.')
  await (plugin.transform as (code: string, id: string) => Promise<void>)(code, id)
}

/**
 * Close a build or watcher through the public Vite hook.
 *
 * ---
 *
 * 通过公开的 Vite 钩子关闭构建或监听器。
 */
async function close(plugin: Plugin, name: 'closeBundle' | 'closeWatcher'): Promise<void> {
  const hook = plugin[name]
  if (typeof hook !== 'function') throw new TypeError('Expected a function cleanup hook.')
  await (hook as () => Promise<void>)()
}
