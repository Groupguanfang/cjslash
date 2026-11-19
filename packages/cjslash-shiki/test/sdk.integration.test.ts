import type { Cjslash } from 'cjslash'
import type { Highlighter } from 'shiki'
import process from 'node:process'
import { createCjslasher } from 'cjslash'
import { createHighlighter } from 'shiki'
import { cangjieLanguage, transformerCjslash } from '../src/index'

const sdkPath = process.env.CJSLASH_SDK_PATH || process.env.CANGJIE_HOME
const code = 'let answer = 42\n//  ^?\nmain() { println(answer) }\n'

describe.skipIf(!sdkPath)('shiki integration with the real Cangjie SDK', () => {
  let cjslasher: Cjslash
  let highlighter: Highlighter

  beforeAll(async () => {
    cjslasher = await createCjslasher({ sdkPath: sdkPath! })
    highlighter = await createHighlighter({
      langs: [cangjieLanguage],
      themes: ['monokai'],
    })
  })

  afterAll(async () => {
    highlighter?.dispose()
    await cjslasher?.[Symbol.asyncDispose]()
  })

  it('renders real hover and query results after cropping hidden source and annotations', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const source = `// @noErrorsCutted\nlet hidden = 0\n// ---cut---\n${code}`
    const result = await transformer.prepare(source)
    const preprocess = vi.fn()
    const html = highlighter.codeToHtml(source, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [
        transformer,
        { preprocess },
      ],
    })
    expect(result.code).toBe('let answer = 42\nmain() { println(answer) }\n')
    expect(preprocess.mock.calls[0][0]).toBe(result.code)
    expect(result.queries[0]).toMatchObject({
      start: 4,
      line: 0,
      character: 4,
      target: 'answer',
    })
    expect(result.queries[0].text).toContain('Int64')
    expect(html).toContain('twoslash-query')
    expect(html).toContain('twoslash-hover')
    expect(html).toContain('Int64')
    expect(html).not.toContain('hidden')
    expect(result.code).not.toContain('---cut---')
    expect(html).not.toContain('^?')
  })

  it('renders expected real diagnostics and recovers from failed preparation', async () => {
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const invalid = 'main() {\n    let value: Int64 = "bad"\n    println(value)\n}\n'
    await expect(transformer.prepare(invalid)).rejects.toMatchObject({ code: 'UNEXPECTED_DIAGNOSTIC' })
    const source = `// @errors: 731\n${invalid}`
    const result = await transformer.prepare(source)
    const html = highlighter.codeToHtml(source, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(result.errors.some(node => node.code === 731)).toBe(true)
    expect(html).toContain('twoslash-error')
    expect(html).not.toContain('@errors')
    await transformer.prepare(code)
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })).not.toContain('twoslash-error')
  })

  it('renders upstream completion popups with candidates resolved from another file', async () => {
    const source = '// @noErrors\n// @filename: data.cj\nlet message = "hello"\n// @filename: main.cj\nmain() {\n    message.si\n//            ^|\n}\n'
    const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
    const result = await transformer.prepare(source)
    const html = highlighter.codeToHtml(source, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(result.completions[0].completions).toContainEqual(expect.objectContaining({ name: 'size' }))
    expect(html).toContain('twoslash-completion-list')
    expect(html).toContain('twoslash-completions-matched')
    expect(html).toContain('data.cj')
    expect(html).toContain('main.cj')
    expect(html).not.toContain('^|')
  })

  it('renders real highlights and custom tags with the upstream rich renderer', async () => {
    const source = '// @warn: Real SDK annotation\nlet answer = 42\n//  ^^^^^^ Important answer\nmain() { println(answer) }\n'
    const transformer = transformerCjslash({
      cjslasher: cjslasher.analyze,
      cjslashOptions: {
        customTags: ['warn'],
      },
    })
    const result = await transformer.prepare(source)
    const html = highlighter.codeToHtml(source, {
      lang: 'cangjie',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(result.highlights[0]).toMatchObject({ start: 4, length: 6 })
    expect(html).toContain('twoslash-highlighted')
    expect(html).toContain('twoslash-tag')
    expect(html).toContain('Real SDK annotation')
    expect(html).not.toContain('^^^^^^')
  })

  it('renders UTF-16 query positions after Chinese text and emoji with CRLF', async () => {
    const source = 'main() {\r\n    let label = "中文😀"; let answer = 42\r\n    println(label)\r\n    println(answer)\r\n}\r\n'
    const transformer = transformerCjslash({
      cjslasher: cjslasher.analyze,
      cjslashOptions: {
        positionQueries: [
          source.indexOf('answer'),
        ],
      },
    })
    const result = await transformer.prepare(source)
    const html = highlighter.codeToHtml(source, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(result.queries[0]).toMatchObject({
      target: 'answer',
      start: source.indexOf('answer'),
      line: 1,
      character: source.split('\r\n')[1].indexOf('answer'),
    })
    expect(html).toContain('twoslash-query')
    expect(html).toContain('Int64')
    expect(html).toContain('中文😀')
  })

  it('preserves notations and renders independently cached examples', async () => {
    const transformer = transformerCjslash({
      cjslasher: cjslasher.analyze,
      cjslashOptions: {
        handbookOptions: { keepNotations: true, noStaticSemanticInfo: true },
      },
    })
    const stringCode = code.replace('42', '"hello"')
    const [numeric, string] = await Promise.all([
      transformer.prepare(code),
      transformer.prepare(stringCode),
    ])
    expect(numeric.code).toBe(code)
    expect(numeric.hovers).toEqual([])
    expect(numeric.queries[0].text).toContain('Int64')
    expect(string.queries[0].text).toContain('String')
    for (const source of [code, stringCode, code]) {
      const html = highlighter.codeToHtml(source, {
        lang: 'cj',
        theme: 'monokai',
        transformers: [transformer],
      })
      expect(html).toContain('^?')
      expect(html).toContain(source === code
        ? 'Int64'
        : 'String')
      expect(html).toContain('twoslash-query-persisted')
    }
  })

  it('allows prepared results to outlive their asynchronously disposed analyzer', async () => {
    const transformer = await (async () => {
      await using cjslasher = await createCjslasher({ sdkPath: sdkPath! })
      const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
      await transformer.prepare(code)
      return transformer
    })()
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })).toContain('Int64')
    await expect(transformer.prepare('main() {}')).rejects.toMatchObject({ code: 'DISPOSED' })
  })
})
