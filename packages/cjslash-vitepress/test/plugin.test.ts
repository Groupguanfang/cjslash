import type { Cjslash } from 'cjslash'
import type { Plugin } from 'vitepress'
import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress'
import { URI, Utils } from 'vscode-uri'
import { cangjieLanguage, transformerCjslash, vitePluginCjslash } from '../src/index'
import { createResult } from './helpers'

const directory = Utils.dirname(URI.parse(import.meta.url))
const query = 'let answer = 42\n//  ^?\nmain() { println(answer) }'
const source = `\`\`\`cj cjslash\n${query}\n\`\`\``

afterEach(() => {
  disposeMdItInstance()
})

describe('vitePress Markdown integration', () => {
  it('prepares before highlighting without duplicating VitePress wrappers', async () => {
    const output = 'let answer = 42\nmain() { println(answer) }'
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(output, [
      {
        type: 'query',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'answer: Int64',
      },
      {
        type: 'hover',
        start: 35,
        length: 5,
        target: 'println',
        text: 'println(i: Int64): Unit',
      },
    ]))
    const transformer = transformerCjslash({ cjslasher })
    await transform(vitePluginCjslash(transformer), source)
    const html = await render(source, transformer)
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith(query, 'cj', {})
    expect(html).toContain('twoslash lsp')
    expect(html).toContain('<v-menu')
    expect(html).toContain('Int64')
    expect(html).not.toContain('^?')
    expect(html).not.toContain('markdown-it-async')
    expect(html).not.toMatch(/<pre[^>]*v-pre/)
    expect(html.match(/class="language-cj"/g)).toHaveLength(1)
    expect(html.match(/class="lang">cj/g)).toHaveLength(1)
    expect(await render(source, transformer)).toBe(html)
    expect(cjslasher).toHaveBeenCalledOnce()
  })

  it('preserves ordinary, disabled, and aliased fences as well as Vue syntax', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockImplementation(async code => createResult(code))
    const transformer = transformerCjslash({ cjslasher })
    const markdown = [
      '```cj',
      'let ordinary = 1',
      '```',
      '',
      '```cj nocjslash',
      'let disabled = 2',
      '```',
      '',
      '::: tip',
      '',
      '```cangjie{1} cjslash [Example]',
      'let message = "{{ answer }}"',
      '```',
      '',
      ':::',
    ].join('\r\n')
    await transform(vitePluginCjslash(transformer), markdown)
    const html = await render(markdown, transformer)
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith('let message = "{{ answer }}"', 'cj', {})
    expect(html).toMatch(/<pre[^>]*v-pre/)
    expect(html).toContain('tip custom-block')
    expect(html).toContain('line highlighted')
    expect(html).toContain('twoslash lsp')
    expect(html).toContain('&#123;&#123; answer }}')
    expect(html).not.toContain('{{ answer }}')
  })

  it('leaves failures to upstream rendering callbacks and retries on a new render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('Analysis failed')
    const fallback = 'let fallback = 0'
    const cjslasher = vi.fn<Cjslash['analyze']>().mockRejectedValueOnce(failure).mockResolvedValue(createResult(fallback))
    const onTwoslashError = vi.fn((): string => fallback)
    const transformer = transformerCjslash({ cjslasher, onTwoslashError, throws: false })
    const input = '```cj cjslash\nlet answer = 42\n```'
    await transform(vitePluginCjslash(transformer), input)
    const md = await renderer(transformer)
    expect(await md.renderAsync(input)).toContain('fallback')
    expect(onTwoslashError).toHaveBeenCalledWith(failure, 'let answer = 42', 'cj', expect.anything())
    await transform(vitePluginCjslash(transformer), input)
    expect(await md.renderAsync(input)).toContain('twoslash lsp')
    expect(cjslasher).toHaveBeenCalledTimes(2)
  })

  it('ignores non-Markdown, query, and node_modules modules', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult('let answer = 42'))
    const plugin = vitePluginCjslash(transformerCjslash({ cjslasher }))
    await transform(plugin, source, '/src/example.ts')
    await transform(plugin, source, '/node_modules/package/example.md')
    expect(cjslasher).not.toHaveBeenCalled()
    await transform(plugin, source, '/docs/example.md?raw')
    expect(cjslasher).toHaveBeenCalledOnce()
  })

  it('degrades unprepared VitePress renders to static highlighting', async () => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>(),
      allowUnprepared: true,
    })
    const html = await render(source, transformer)
    expect(html).not.toContain('twoslash lsp')
    expect(html).not.toContain('twoslash-hover')
    expect(html).toMatch(/<pre[^>]*v-pre/)
  })

  it('lets analysis failures reach the rendering error handler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('Analysis failed')
    const cjslasher = vi.fn<Cjslash['analyze']>().mockRejectedValue(failure)
    const transformer = transformerCjslash({ cjslasher, throws: false })
    await expect(transform(vitePluginCjslash(transformer), source)).resolves.toBeUndefined()
    expect(await render(source, transformer)).not.toContain('twoslash lsp')
  })
})

/**
 * Render Markdown with the same VitePress options used by the documentation.
 *
 * ---
 *
 * 使用文档相同的 VitePress 配置渲染 Markdown。
 */
function renderer(transformer: ReturnType<typeof transformerCjslash>): ReturnType<typeof createMarkdownRenderer> {
  return createMarkdownRenderer(directory.fsPath, {
    theme: 'monokai',
    languages: [cangjieLanguage],
    codeTransformers: [transformer],
  })
}

/**
 * Render Markdown through the real VitePress renderer.
 *
 * ---
 *
 * 通过真实的 VitePress 渲染器渲染 Markdown。
 */
function render(markdown: string, transformer: ReturnType<typeof transformerCjslash>): Promise<string> {
  return renderer(transformer).then(md => md.renderAsync(markdown))
}

/**
 * Run the plugin's transform hook for a module identifier.
 *
 * ---
 *
 * 针对模块标识运行插件的 transform 钩子。
 */
async function transform(plugin: Plugin, code: string, id = '/docs/example.md'): Promise<void> {
  if (typeof plugin.transform !== 'function') throw new TypeError('Expected a function transform hook.')
  await (plugin.transform as (this: unknown, code: string, id: string) => Promise<void>).call({}, code, id)
}
