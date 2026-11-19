import type { Cjslash, CjslashExecuteOptions } from 'cjslash'
import type { Highlighter } from 'shiki'
import { rendererClassic as upstreamRendererClassic, rendererRich as upstreamRendererRich, ShikiTwoslashError as UpstreamShikiTwoslashError } from '@shikijs/twoslash/core'
import { createHighlighter } from 'shiki'
import { cangjieLanguage, rendererClassic, rendererRich, ShikiTwoslashError, transformerCjslash } from '../src/index'
import { createResult } from './helpers'

const code = 'let answer = 42\n'
let highlighter: Highlighter

beforeAll(async () => {
  highlighter = await createHighlighter({
    langs: [cangjieLanguage],
    themes: ['monokai'],
  })
})

afterAll(() => {
  highlighter?.dispose()
})

describe('asynchronous preparation', () => {
  it('shares concurrent preparation and reuses a successful result', async () => {
    const result = createResult(code)
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(result)
    const transformer = transformerCjslash({ cjslasher })
    const first = transformer.prepare(code)
    expect(transformer.prepare(code)).toBe(first)
    expect(await first).toBe(result)
    expect(await transformer.prepare(code)).toBe(result)
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith(code, 'cj', {})
  })

  it('keeps separate entries for exact original sources even with identical output', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code))
    const transformer = transformerCjslash({ cjslasher })
    const source = `// ---cut---\n${code}`
    await Promise.all([
      transformer.prepare(source),
      transformer.prepare(code),
    ])
    for (const input of [source, code]) {
      expect(highlighter.codeToHtml(input, {
        lang: 'cj',
        theme: 'monokai',
        transformers: [transformer],
      })).toContain('twoslash lsp')
    }
    expect(cjslasher).toHaveBeenCalledTimes(2)
  })

  it.each(['rejection', 'synchronous throw'])('retries after a preparation %s', async (kind) => {
    const error = new Error('Analysis failed')
    const result = createResult(code)
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(result)
    if (kind === 'rejection') {
      cjslasher.mockRejectedValueOnce(error)
    }
    else {
      cjslasher.mockImplementationOnce(() => {
        throw error
      })
    }
    const transformer = transformerCjslash({ cjslasher, throws: false })
    await expect(transformer.prepare(code)).rejects.toBe(error)
    expect(await transformer.prepare(code)).toBe(result)
    expect(cjslasher).toHaveBeenCalledTimes(2)
  })

  it('captures execution settings while preserving callbacks and cancellation signals', async () => {
    const abortController = new AbortController()
    const filterNode = vi.fn(() => true)
    const shouldGetHoverInfo = vi.fn(() => true)
    const options: CjslashExecuteOptions = {
      customTags: ['warn'],
      handbookOptions: {
        errors: [731],
      },
      positionQueries: [4],
      positionHighlights: [
        [4, 10, 'answer'],
      ],
      signal: abortController.signal,
      filterNode,
      shouldGetHoverInfo,
    }
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code))
    const transformer = transformerCjslash({ cjslasher, cjslashOptions: options })
    options.customTags!.push('error')
    options.handbookOptions!.errors!.push(999)
    options.positionQueries!.push(0)
    options.positionHighlights![0][1] = 5
    await transformer.prepare(code)
    expect(cjslasher).toHaveBeenCalledWith(code, 'cj', {
      customTags: ['warn'],
      handbookOptions: {
        errors: [731],
      },
      positionQueries: [4],
      positionHighlights: [
        [4, 10, 'answer'],
      ],
      signal: abortController.signal,
      filterNode,
      shouldGetHoverInfo,
    })
  })
})

describe('shiki rendering', () => {
  it('requires preparation before rendering without calling the async analyzer', () => {
    const cjslasher = vi.fn<Cjslash['analyze']>()
    const transformer = transformerCjslash({ cjslasher })
    const render = (): string => highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(render).toThrow(ShikiTwoslashError)
    expect(render).toThrow('await transformer.prepare(code)')
    expect(cjslasher).not.toHaveBeenCalled()
  })

  it.each(['cj', 'cangjie', 'Cangjie'])('highlights %s with the official grammar and preserved Cangjie signatures', async (lang) => {
    const result = createResult(code, [
      {
        type: 'hover',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'answer(): Int64',
      },
    ])
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(result),
      rendererRich: { processHoverInfo: undefined },
    })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang,
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(html).toContain('twoslash-hover')
    expect(html).toContain('Int64')
    expect(html).not.toContain('type ')
    expect(html).not.toContain('function')
    expect(html).toContain('color:')
    expect(cangjieLanguage).toMatchObject({
      name: 'cangjie',
      scopeName: 'source.cj',
      aliases: ['cj', 'Cangjie'],
    })
  })

  it('renders cropped queries, diagnostics, highlights, and tags through the upstream renderer', async () => {
    const output = 'let answer = 42\nlet value: Int64 = "bad"\n'
    const source = `// ---cut---\n${output}//  ^?\n`
    const result = createResult(output, [
      {
        type: 'query',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'let answer: Int64',
      },
      {
        type: 'highlight',
        start: 4,
        length: 6,
        text: 'Important answer',
      },
      {
        type: 'error',
        start: output.indexOf('"bad"'),
        length: 5,
        text: 'mismatched types',
        code: 731,
        level: 'error',
        id: 'err-731',
      },
      {
        type: 'tag',
        start: 0,
        length: 0,
        name: 'warn',
        text: 'Read this example carefully',
      },
    ])
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(result),
    })
    await transformer.prepare(source)
    const html = highlighter.codeToHtml(source, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    for (const text of [
      'twoslash-query',
      'twoslash-error',
      'twoslash-highlighted',
      'twoslash-tag',
      'Int64',
      'mismatched types',
      'Read this example carefully',
    ]) expect(html).toContain(text)
    expect(html).not.toContain('---cut---')
    expect(html).not.toContain('^?')
  })

  it('accepts a custom renderer without wrapping its node output', async () => {
    const nodeStaticInfo = vi.fn().mockReturnValue({
      type: 'element',
      tagName: 'mark',
      properties: { class: 'custom-hover' },
      children: [
        { type: 'text', value: 'custom signature' },
      ],
    })
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code, [
        {
          type: 'hover',
          start: 4,
          length: 6,
          target: 'answer',
          text: 'Int64',
        },
      ])),
      renderer: { nodeStaticInfo },
    })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })
    expect(nodeStaticInfo).toHaveBeenCalledOnce()
    expect(html).toContain('<mark class="custom-hover">custom signature</mark>')
    expect(html).not.toContain('twoslash-hover')
  })

  it('forwards rich renderer options', async () => {
    const processHoverInfo = vi.fn((text: string): string => `CUSTOM ${text}`)
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code, [
        {
          type: 'hover',
          start: 4,
          length: 6,
          target: 'answer',
          text: 'Int64',
        },
      ])),
      rendererRich: { processHoverInfo },
    })
    await transformer.prepare(code)
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [transformer],
    })).toContain('CUSTOM')
    expect(processHoverInfo).toHaveBeenCalled()
  })

  it('keeps upstream renderer and error exports unchanged', () => {
    expect(rendererClassic).toBe(upstreamRendererClassic)
    expect(rendererRich).toBe(upstreamRendererRich)
    expect(ShikiTwoslashError).toBe(UpstreamShikiTwoslashError)
  })
})

describe('upstream transformer options', () => {
  it.each([
    [true, 'cjslash', true],
    [true, 'twoslash', false],
    [true, '', false],
    [/example/, 'example', true],
    [false, '', true],
    [false, 'nocjslash', false],
    [false, 'no-cjslash', false],
  ] as const)('uses explicitTrigger=%s with meta=%j', async (explicitTrigger, raw, enabled) => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code)),
      explicitTrigger,
    })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: raw },
      transformers: [transformer],
    })
    expect(html.includes('twoslash lsp')).toBe(enabled)
  })

  it('forwards language filters, disable triggers, and custom filter callbacks', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code))
    const transformer = transformerCjslash({
      cjslasher,
      langs: ['cj'],
      langAlias: { cangjie: 'cj' },
      disableTriggers: [/skip/],
    })
    await transformer.prepare(code)
    expect(highlighter.codeToHtml(code, {
      lang: 'cangjie',
      theme: 'monokai',
      meta: { __raw: 'skip' },
      transformers: [transformer],
    })).not.toContain('twoslash lsp')
    expect(highlighter.codeToHtml('plain text', {
      lang: 'text',
      theme: 'monokai',
      transformers: [transformer],
    })).not.toContain('twoslash lsp')
    const filter = vi.fn(() => false)
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [
        transformerCjslash({ cjslasher, filter }),
      ],
    })).not.toContain('twoslash lsp')
    expect(filter).toHaveBeenCalledWith('cj', code, expect.any(Object), expect.any(Object))
  })

  it('keeps upstream synchronous error handling and recovery', () => {
    const cjslasher = vi.fn<Cjslash['analyze']>()
    const onTwoslashError = vi.fn(() => 'main() {}')
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [
        transformerCjslash({ cjslasher, onTwoslashError }),
      ],
    })).not.toContain('answer')
    expect(onTwoslashError).toHaveBeenCalledWith(expect.any(ShikiTwoslashError), code, 'cj', expect.any(Object))
    expect(highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      transformers: [
        transformerCjslash({ cjslasher, throws: false }),
      ],
    })).not.toContain('twoslash lsp')
  })
})
