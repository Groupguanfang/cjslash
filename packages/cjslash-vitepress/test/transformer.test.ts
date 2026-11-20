import type { Cjslash } from '@cjslash/core'
import type { Highlighter } from 'shiki'
import type { VitePressPluginCjslashOptions } from '../src/types'
import { rendererFloatingVue as upstreamRendererFloatingVue } from '@shikijs/vitepress-twoslash'
import { createHighlighter } from 'shiki'
import { cangjieLanguage, rendererFloatingVue, ShikiTwoslashError, transformerCjslash } from '../src/index'
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

describe('custom filters and rendering', () => {
  it('runs custom filters upstream with the complete Shiki options and context', async () => {
    const filter = vi.fn<NonNullable<VitePressPluginCjslashOptions['filter']>>((lang, source, options, context): boolean => {
      return lang === 'cj' && source === code.trimEnd() && options.meta?.__raw === 'custom' && 'theme' in options && options.theme === 'monokai' && !!context?.codeToHast
    })
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code)),
      filter,
    })
    await transformer.prepareMarkdown(`\`\`\`cj custom\n${code}\`\`\``)
    expect(filter).not.toHaveBeenCalled()
    const html = highlighter.codeToHtml(code.trimEnd(), {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'custom' },
      transformers: [transformer],
    })
    expect(html).toContain('twoslash lsp')
    expect(filter).toHaveBeenCalledOnce()
  })
})

describe('asynchronous preparation', () => {
  it('shares concurrent work, reuses results, and preserves execution options', async () => {
    const result = createResult(code)
    const abortController = new AbortController()
    const filterNode = vi.fn(() => true)
    const shouldGetHoverInfo = vi.fn(() => true)
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(result)
    const transformer = transformerCjslash({
      cjslasher,
      cjslashOptions: {
        customTags: ['warn'],
        handbookOptions: {
          errors: [731],
        },
        signal: abortController.signal,
        filterNode,
        shouldGetHoverInfo,
      },
    })
    const first = transformer.prepare(code)
    expect(transformer.prepare(code)).toBe(first)
    expect(await first).toBe(result)
    expect(await transformer.prepare(code)).toBe(result)
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith(code, 'cj', {
      customTags: ['warn'],
      handbookOptions: {
        errors: [731],
      },
      signal: abortController.signal,
      filterNode,
      shouldGetHoverInfo,
    })
  })

  it('caches preparation failures and allows a retry', async () => {
    const failure = new Error('Analysis failed')
    const result = createResult(code)
    const cjslasher = vi.fn<Cjslash['analyze']>().mockRejectedValueOnce(failure).mockResolvedValueOnce(result)
    const transformer = transformerCjslash({ cjslasher })
    await expect(transformer.prepare(code)).rejects.toBe(failure)
    expect(await transformer.prepare(code)).toBe(result)
    expect(cjslasher).toHaveBeenCalledTimes(2)
  })
})

describe('vitePress rendering', () => {
  it('uses cjslash when explicitTrigger is explicitly enabled', async () => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code)),
      explicitTrigger: true,
    })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'cjslash' },
      transformers: [transformer],
    })
    expect(html).toContain('twoslash lsp')
  })

  it('renders the upstream FloatingVue renderer and preserves Cangjie signatures', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code, [
      {
        type: 'hover',
        start: 4,
        length: 6,
        target: 'answer',
        text: 'answer(): Int64',
      },
    ]))
    const transformer = transformerCjslash({ cjslasher })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'cjslash' },
      transformers: [transformer],
    })
    expect(html).toContain('<v-menu')
    expect(html).toContain('twoslash-hover')
    expect(html).toContain('Int64')
    expect(html).not.toContain('function')
    expect(rendererFloatingVue).toBe(upstreamRendererFloatingVue)
  })

  it('requires preparation and reports the upstream error', () => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>(),
    })
    expect(() => highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'cjslash' },
      transformers: [transformer],
    })).toThrow(ShikiTwoslashError)
  })

  it('can render unprepared sources without analysis when explicitly enabled', () => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>(),
      allowUnprepared: true,
    })
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'cjslash' },
      transformers: [transformer],
    })
    expect(html).toContain('answer')
    expect(html).not.toContain('twoslash-hover')
    expect(html).not.toContain('twoslash lsp')
  })

  it('uses prepared results when allowUnprepared is enabled', async () => {
    const transformer = transformerCjslash({
      cjslasher: vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult(code, [
        {
          type: 'hover',
          start: 4,
          length: 6,
          target: 'answer',
          text: 'answer(): Int64',
        },
      ])),
      allowUnprepared: true,
    })
    await transformer.prepare(code)
    const html = highlighter.codeToHtml(code, {
      lang: 'cj',
      theme: 'monokai',
      meta: { __raw: 'cjslash' },
      transformers: [transformer],
    })
    expect(html).toContain('twoslash lsp')
    expect(html).toContain('twoslash-hover')
  })

  it('uses cached preparation errors through the upstream fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cjslasher = vi.fn<Cjslash['analyze']>().mockRejectedValue(new Error('Analysis failed'))
    const transformer = transformerCjslash({ cjslasher, throws: false })
    return transformer.prepare(code).catch(() => {
      const html = highlighter.codeToHtml(code, {
        lang: 'cj',
        theme: 'monokai',
        meta: { __raw: 'cjslash' },
        transformers: [transformer],
      })
      expect(html).toContain('answer')
      expect(html).not.toContain('twoslash lsp')
    })
  })
})
