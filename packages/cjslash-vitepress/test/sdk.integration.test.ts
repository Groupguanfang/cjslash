import type { Cjslash } from 'cjslash'
import type { EnhanceAppContext, Theme } from 'vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createCjslasher } from 'cjslash'
import { createHighlighter } from 'shiki'
import { createMarkdownRenderer, createServer, disposeMdItInstance, resolveConfig } from 'vitepress'
import { URI, Utils } from 'vscode-uri'
import { createApp } from 'vue'
import { cangjieLanguage, transformerCjslash, vitePluginCjslash } from '../src/index'

const directory = Utils.dirname(URI.parse(import.meta.url))
const sdkPath = process.env.CJSLASH_SDK_PATH || process.env.CANGJIE_HOME

describe.skipIf(!sdkPath)('vitepress integration with the real Cangjie SDK', () => {
  let cjslasher: Cjslash

  beforeAll(async () => {
    cjslasher = await createCjslasher({ sdkPath: sdkPath! })
  })

  afterEach(() => {
    disposeMdItInstance()
  })

  afterAll(async () => {
    await cjslasher?.[Symbol.asyncDispose]()
  })

  it('shares the client and renders both TypeScript and Cangjie in a real VitePress server', async (): Promise<void> => {
    const root = Utils.joinPath(directory, 'fixtures/site').fsPath
    const config = await resolveConfig(root, 'serve', 'test')
    config.markdown = {
      theme: 'monokai',
      languages: ['js', 'jsx', 'ts', 'tsx'],
      codeTransformers: [
        transformerTwoslash({ throws: true }),
      ],
    }
    config.vite = {
      logLevel: 'silent',
      cacheDir: Utils.resolvePath(directory, '../../../node_modules/.cache/cjslash-vitepress-test').fsPath,
      plugins: [
        vitePluginCjslash({ sdkPath }),
      ],
      optimizeDeps: {
        noDiscovery: true,
        include: [],
      },
    }
    const server = await createServer(root, { hmr: false, watch: null }, undefined, config)
    try {
      const rendered = await server.transformRequest('/index.md')
      expect(rendered?.code).toContain('twoslash lsp')
      expect(rendered?.code).toContain('Int64')
      expect(rendered?.code).toContain('twoslash-query')
      expect(rendered?.code).toContain('twoslash-hover')
      expect(rendered?.code).toContain('toUpperCase')
      expect(rendered?.code?.match(/twoslash lsp/g)).toHaveLength(2)
      expect(rendered?.code).not.toContain('^?')
      const theme = (await server.ssrLoadModule('@theme/index')).default as Theme
      const app = createApp({})
      await theme.enhanceApp?.({ app } as EnhanceAppContext)
      expect(app.component('VMenu')).toBeDefined()
    }
    finally {
      await server.close()
    }
  })

  it('renders a real query, hover popup, and removes VitePress v-pre', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const source = [
      '```cj cjslash',
      'let answer = 42',
      '//  ^?',
      'main() { println(answer) }',
      '```',
    ].join('\n')
    await transformMarkdown(source, transformer)
    const md = await createMarkdownRenderer(process.cwd(), {
      theme: 'monokai',
      languages: [cangjieLanguage],
      codeTransformers: [transformer],
    })
    const html = await md.renderAsync(source)
    expect(html).toContain('twoslash lsp')
    expect(html).toContain('theme="twoslash-query"')
    expect(html).toContain(':shown="true"')
    expect(html).toContain('<v-menu')
    expect(html).toContain('Int64')
    expect(html).toContain('println')
    expect(html).not.toContain('^?')
    expect(html).not.toMatch(/<pre[^>]*v-pre/)
    expect(html).toMatch(/class="twoslash-popup-container[^"]*" v-pre/)
  })

  it('renders real diagnostics and keeps ordinary Cangjie fences unchanged', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze, throws: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const invalid = [
      '```cj cjslash',
      '// @errors: 731',
      'main() {',
      '    let value: Int64 = "bad"',
      '    println(value)',
      '}',
      '```',
    ].join('\n')
    await transformMarkdown(invalid, transformer)
    const md = await createMarkdownRenderer(process.cwd(), {
      theme: 'monokai',
      languages: [cangjieLanguage],
      codeTransformers: [transformer],
    })
    const html = await md.renderAsync(invalid)
    expect(html).toContain('twoslash-error')
    expect(html).not.toContain('@errors')
    const ordinary = await md.renderAsync('```cj\nmain() {}\n```')
    expect(ordinary).toMatch(/<pre[^>]*v-pre/)
    expect(ordinary).not.toContain('twoslash lsp')
  })

  it('removes cut markers and manifest annotations from rendered code and hover documentation', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const source = [
      '```cj cjslash',
      '// @noErrorsCutted',
      'let hidden: Int64 = "bad"',
      '// ---cut---',
      'let answer = 42',
      '//  ^?',
      'main() { println(answer) }',
      '```',
      '',
      '```cj cjslash',
      'package example',
      '// @package.version: "0.2.0"',
      '// @package.src-dir: "examples"',
      '// @profile.build.incremental',
      'let answer = 42',
      '//  ^?',
      'main() { println(answer) }',
      '```',
    ].join('\n')
    await transformMarkdown(source, transformer)
    const md = await createMarkdownRenderer(process.cwd(), {
      theme: 'monokai',
      languages: [cangjieLanguage],
      codeTransformers: [transformer],
    })
    const html = await md.renderAsync(source)
    expect(html.match(/twoslash lsp/g)).toHaveLength(2)
    expect(html).not.toContain('---cut---')
    expect(html).not.toContain('@package.version')
    expect(html).not.toContain('@package.src-dir')
    expect(html).not.toContain('@profile.build.incremental')
    expect(html).not.toContain('// @noErrorsCutted')
  })

  it('renders completions from a multi-file example using the upstream client markup', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const source = '```cj cjslash\n// @noErrors\n// @filename: data.cj\nlet message = "hello"\n// @filename: main.cj\nmain() {\n    message.si\n//            ^|\n}\n```\n'
    await transformMarkdown(source, transformer)
    const md = await createMarkdownRenderer(process.cwd(), {
      theme: 'monokai',
      languages: [cangjieLanguage],
      codeTransformers: [transformer],
    })
    const html = await md.renderAsync(source)
    expect(html).toContain('twoslash-completion-list')
    expect(html).toContain('twoslash-completions-matched')
    expect(html).toContain('data.cj')
    expect(html).toContain('main.cj')
    expect(html).not.toContain('^|')
    expect(html).not.toMatch(/<pre[^>]*v-pre/)
  })

  it('keeps prepared results available after the analyzer is disposed', async () => {
    const source = 'let answer = 42\n//  ^?\nmain() { println(answer) }\n'
    const transformer = await (async () => {
      await using scoped = await createCjslasher({ sdkPath: sdkPath! })
      const transformer = transformerCjslash({ cjslasher: scoped.analyze })
      await transformer.prepare(source)
      return transformer
    })()
    const highlighter = await createHighlighter({
      langs: [cangjieLanguage],
      themes: ['monokai'],
    })
    try {
      expect(highlighter.codeToHtml(source, {
        lang: 'cj',
        theme: 'monokai',
        meta: { __raw: 'cjslash' },
        transformers: [transformer],
      })).toContain('Int64')
    }
    finally {
      highlighter.dispose()
    }
    await expect(transformer.prepare('main() {}')).rejects.toMatchObject({ code: 'DISPOSED' })
  })
})

/**
 * Prepare fences through the package's Vite transform hook.
 *
 * ---
 *
 * 通过本包的 Vite transform 钩子准备围栏。
 */
async function transformMarkdown(code: string, transformer: ReturnType<typeof transformerCjslash>): Promise<void> {
  const plugin = vitePluginCjslash(transformer)
  if (typeof plugin.transform !== 'function') throw new TypeError('Expected a function transform hook.')
  await (plugin.transform as (this: unknown, code: string, id: string) => Promise<void>).call({}, code, '/docs/example.md')
}
