import type { Cjslash } from '@cjslash/core'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress'
import { URI, Utils } from 'vscode-uri'
import { cangjieLanguage, transformerCjslash } from '../src/index'
import { createResult } from './helpers'

const directory = Utils.dirname(URI.parse(import.meta.url))
const cangjie = 'let answer = 42\n//  ^?\nmain() { println(answer) }'
const cangjieOutput = 'let answer = 42\nmain() { println(answer) }'
const typescript = 'const message = "hello"\n//    ^?\nconsole.log(message.toUpperCase())'
const source = `\`\`\`ts twoslash\n${typescript}\n\`\`\`\n\n\`\`\`cj cjslash\n${cangjie}\n\`\`\``

afterEach((): void => {
  disposeMdItInstance()
})

describe('compatibility with TypeScript Twoslash', (): void => {
  it.each([false, true])('renders both languages once with both transformer orders: %s', async (cjslashFirst: boolean): Promise<void> => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(cangjieOutput, [
      {
        type: 'query',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'answer: Int64',
      },
      {
        type: 'hover',
        start: cangjieOutput.indexOf('println'),
        length: 7,
        target: 'println',
        text: 'println(i: Int64): Unit',
      },
    ]))
    const cjslash = transformerCjslash({ cjslasher })
    const twoslash = transformerTwoslash({ throws: true })
    await cjslash.prepareMarkdown(source)
    const markdown = await createMarkdownRenderer(directory.fsPath, {
      theme: 'monokai',
      languages: [
        'js',
        'jsx',
        'ts',
        'tsx',
        cangjieLanguage,
      ],
      codeTransformers: cjslashFirst
        ? [cjslash, twoslash]
        : [twoslash, cjslash],
    })
    const typescriptHtml = await markdown.renderAsync(`\`\`\`ts twoslash\n${typescript}\n\`\`\``)
    const cangjieHtml = await markdown.renderAsync(`\`\`\`cj cjslash\n${cangjie}\n\`\`\``)
    const html = await markdown.renderAsync(source)
    expect(html).toBe(typescriptHtml + cangjieHtml)
    expect(html.match(/twoslash lsp/g)).toHaveLength(2)
    expect(html.match(/theme="twoslash-query"/g)).toHaveLength(2)
    expect(typescriptHtml).toContain('twoslash-hover')
    expect(typescriptHtml).toContain('toUpperCase')
    expect(typescriptHtml).not.toContain('Int64')
    expect(cangjieHtml).toContain('twoslash-hover')
    expect(cangjieHtml).toContain('Int64')
    expect(cangjieHtml).not.toContain('toUpperCase')
    expect(html).not.toContain('^?')
    expect(html).not.toMatch(/<pre[^>]*v-pre/)
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith(cangjie, 'cj', {})
    expect(await markdown.renderAsync(source)).toBe(html)
    expect(cjslasher).toHaveBeenCalledOnce()
  })

  it('keeps ordinary and disabled fences static without mixing language triggers', async (): Promise<void> => {
    const cjslasher = vi.fn<Cjslash['analyze']>()
    const cjslash = transformerCjslash({ cjslasher, allowUnprepared: true })
    const input = [
      '```ts',
      'const message = "{{ ordinary }}"',
      '```',
      '```ts twoslash notwoslash',
      'const message = "disabled"',
      '```',
      '```ts cjslash',
      'const message = "{{ cangjieTrigger }}"',
      '```',
      '```cj',
      'let message = "{{ ordinary }}"',
      '```',
      '```cj cjslash nocjslash',
      'let message = "{{ disabled }}"',
      '```',
    ].join('\n')
    await cjslash.prepareMarkdown(input)
    const markdown = await createMarkdownRenderer(directory.fsPath, {
      theme: 'monokai',
      languages: ['ts', cangjieLanguage],
      codeTransformers: [
        transformerTwoslash({ throws: true }),
        cjslash,
      ],
    })
    const html = await markdown.renderAsync(input)
    expect(cjslasher).not.toHaveBeenCalled()
    expect(html).not.toContain('twoslash lsp')
    expect(html).not.toContain('twoslash-hover')
    expect(html.match(/<pre/g)).toHaveLength(5)
    expect(html.match(/<pre[^>]*v-pre/g)).toHaveLength(4)
    expect(html).toContain('{{ ordinary }}')
    expect(html).toContain('{{ cangjieTrigger }}')
    expect(html).toContain('{{ disabled }}')
  })

  it('renders TypeScript diagnostics and completions alongside Cangjie queries without leaking results', async (): Promise<void> => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(cangjieOutput, [
      {
        type: 'query',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'answer: Int64',
      },
    ]))
    const cjslash = transformerCjslash({ cjslasher })
    const input = [
      '```ts twoslash',
      '// @errors: 2322',
      'const value: number = "bad"',
      '```',
      '```cj cjslash',
      cangjie,
      '```',
      '```ts twoslash',
      '// @noErrors',
      'const message = "hello"',
      'message.toU',
      '//         ^|',
      '```',
    ].join('\n')
    await cjslash.prepareMarkdown(input)
    const markdown = await createMarkdownRenderer(directory.fsPath, {
      theme: 'monokai',
      languages: ['ts', cangjieLanguage],
      codeTransformers: [
        transformerTwoslash({ throws: true }),
        cjslash,
      ],
    })
    const html = await markdown.renderAsync(input)
    expect(html.match(/twoslash lsp/g)).toHaveLength(3)
    expect(html).toContain('twoslash-error')
    expect(html).toContain('twoslash-completion-list')
    expect(html).toContain('twoslash-completions-matched">toU</span><span class="twoslash-completions-unmatched">pperCase')
    expect(html).toContain('Int64')
    expect(html).not.toContain('@errors')
    expect(html).not.toContain('^?')
    expect(html).not.toContain('^|')
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith(cangjie, 'cj', {})
    const next = await markdown.renderAsync('```ts twoslash\nconst value = 42\n```')
    expect(next).toContain('twoslash-hover')
    expect(next).not.toContain('Int64')
    expect(next).not.toContain('twoslash-error')
    expect(next).not.toContain('twoslash-completion-list')
  })
})
