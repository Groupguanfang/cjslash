import type { NodeCompletion } from '@cjslash/protocol'
import type { CompletionList, Diagnostic, Hover } from 'vscode-languageserver-protocol'
import type { CjslashExecuteOptions } from '../src/types'
import { CompletionItemKind } from 'vscode-languageserver-protocol'
import { analyzeSource } from '../src/analyze'
import { CjslashError } from '../src/error'
import { parseSource } from '../src/source'
import { createSession } from './helpers'

const code = 'let answer = 42\nmain(answer)\n'
const answerRange = {
  start: { line: 0, character: 4 },
  end: { line: 0, character: 10 },
}
const diagnostic: Diagnostic = {
  range: answerRange,
  message: 'mismatched types',
  code: 731,
  severity: 1,
}

function analyze(source: string, session: ReturnType<typeof createSession>, options: CjslashExecuteOptions = {}) {
  return analyzeSource(source, parseSource(source, options), session, options, new AbortController().signal)
}

function answerHover(contents: Hover['contents'] = { kind: 'markdown', value: '```cangjie\nlet answer: Int64 = 42\n```' }): Hover {
  return { contents, range: answerRange }
}

describe('hover and query nodes', () => {
  it('decodes relative semantic tokens and skips non-identifier token types', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokenTypes: [
        'keyword',
        'variable',
        'number',
        'function',
        'comment',
        'string',
        'regexp',
        'operator',
      ],
      tokens: [
        0,
        0,
        3,
        0,
        0,
        0,
        4,
        6,
        1,
        0,
        0,
        9,
        2,
        2,
        0,
        1,
        0,
        4,
        3,
        0,
        0,
        5,
        6,
        1,
        0,
      ],
    })
    session.hover.mockResolvedValue(answerHover())
    await analyze(code, session)
    expect(session.hover.mock.calls.map(([position]) => position)).toEqual([
      { line: 0, character: 4 },
      { line: 1, character: 0 },
      { line: 1, character: 5 },
    ])
  })

  it.each([
    'comment',
    'keyword',
    'string',
    'number',
    'regexp',
    'operator',
  ])('does not request hover for %s tokens', async (type) => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokenTypes: [type],
      tokens: [0, 4, 6, 0, 0],
    })
    expect((await analyze(code, session)).nodes).toEqual([])
    expect(session.hover).not.toHaveBeenCalled()
  })

  it('shares hover requests between automatic nodes and queries inside the same token', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokenTypes: ['variable'],
      tokens: [0, 4, 6, 0, 0],
    })
    session.hover.mockResolvedValue(answerHover())
    const result = await analyze(code, session, {
      positionQueries: [4, 6],
    })
    expect(result.hovers).toHaveLength(1)
    expect(result.queries).toHaveLength(2)
    expect(session.hover).toHaveBeenCalledTimes(1)
    expect(result.queries[0]).toMatchObject({
      start: 4,
      length: 6,
      line: 0,
      character: 4,
      target: 'answer',
      text: 'let answer: Int64 = 42',
    })
  })

  it('preserves explicit queries when automatic hover collection is disabled or filtered', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokenTypes: ['variable'],
      tokens: [0, 4, 6, 0, 0],
    })
    session.hover.mockResolvedValue(answerHover())
    const shouldGetHoverInfo = vi.fn(() => false)
    const filtered = await analyze(code, session, {
      positionQueries: [4],
      shouldGetHoverInfo,
    })
    expect(filtered.hovers).toEqual([])
    expect(filtered.queries).toHaveLength(1)
    expect(shouldGetHoverInfo).toHaveBeenCalledWith('answer', 4, 'index.cj')
    const disabled = await analyze(code, session, {
      positionQueries: [4],
      handbookOptions: { noStaticSemanticInfo: true },
    })
    expect(disabled.hovers).toEqual([])
    expect(disabled.queries).toHaveLength(1)
  })

  it.each([
    [
      'plaintext',
      'let answer: Int64',
      'let answer: Int64',
      undefined,
    ],
    [
      'marked string',
      { language: 'cangjie', value: 'let answer: Int64' },
      'let answer: Int64',
      undefined,
    ],
    [
      'array',
      [
        { language: 'cangjie', value: 'let answer: Int64' },
        'Documentation',
      ],
      'let answer: Int64',
      'Documentation',
    ],
    [
      'metadata',
      { kind: 'markdown', value: 'Declared in: index.cj  \nPackage info: default\n\n```cangjie\nlet answer: Int64\n```\n\nDocumentation' },
      'let answer: Int64',
      'Documentation',
    ],
    [
      'multiple declarations',
      '```cangjie\nfirst\n```\n\n```cangjie\nsecond\n```',
      'first\n\nsecond',
      undefined,
    ],
    [
      'cut notation',
      '```cangjie\ninternal let answer: Int64 = 42\n```\n\n---\n\n---cut---',
      'internal let answer: Int64 = 42',
      undefined,
    ],
    [
      'manifest annotations',
      '```cangjie\ninternal let answer: Int64 = 42\n```\n\n---\n\n@package.version: "0.2.0"  \n\n\n@package.src-dir: "examples"  \n\n\n@profile.build.incremental',
      'internal let answer: Int64 = 42',
      undefined,
    ],
  ] satisfies [string, Hover['contents'], string, string | undefined][])('normalizes %s hover contents', async (_name, contents, text, docs) => {
    const session = createSession()
    session.hover.mockResolvedValue(answerHover(contents))
    const result = await analyze(code, session, {
      positionQueries: [4],
    })
    expect(result.queries[0]).toMatchObject({ text })
    expect(result.queries[0].docs).toBe(docs)
  })

  it('removes registered custom tags from hover documentation without dropping real docs', async () => {
    const session = createSession()
    session.hover.mockResolvedValue(answerHover('```cangjie\nlet answer: Int64\n```\n\n---\n\n@warn: hidden tag\n\nUseful documentation'))
    const result = await analyze(code, session, {
      customTags: ['warn'],
      positionQueries: [4],
    })
    expect(result.queries[0]).toMatchObject({
      text: 'let answer: Int64',
      docs: '---\n\nUseful documentation',
    })
  })

  it('falls back to semantic token ranges or one character when the LSP omits a range', async () => {
    const session = createSession()
    session.hover.mockResolvedValue({ contents: 'Int64' })
    session.update.mockResolvedValueOnce({
      diagnostics: [],
      tokenTypes: ['variable'],
      tokens: [0, 4, 6, 0, 0],
    })
    expect((await analyze(code, session, {
      positionQueries: [4],
    })).queries[0]).toMatchObject({ start: 4, length: 6, target: 'answer' })
    expect((await analyze(code, session, {
      positionQueries: [4],
    })).queries[0]).toMatchObject({ start: 4, length: 1, target: 'a' })
  })

  it.each([
    null,
    { contents: '' },
    {
      contents: 'Int64',
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 4 },
      },
    },
  ] satisfies (Hover | null)[])('rejects explicit queries without usable hover information: %j', async (hover) => {
    const session = createSession()
    session.hover.mockResolvedValue(hover)
    await expect(analyze(code, session, {
      positionQueries: [4],
    })).rejects.toMatchObject({ code: 'INVALID_QUERY' })
  })

  it('ignores unusable automatic hovers and malformed semantic token lengths', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokenTypes: ['variable'],
      tokens: [
        0,
        4,
        6,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        999,
        0,
        0,
        0,
        0,
      ],
    })
    expect((await analyze(code, session)).nodes).toEqual([])
    expect(session.hover).toHaveBeenCalledTimes(1)
  })
})

describe('completion nodes', () => {
  it.each([false, true])('filters identifier prefixes from LSP responses (CompletionList: %s)', async (list) => {
    const session = createSession()
    const items = [
      { label: 'answer', kind: CompletionItemKind.Variable },
      { label: 'another', kind: CompletionItemKind.Function },
      { label: 'unrelated', filterText: 'ansunrelated' },
    ]
    session.complete.mockResolvedValue(list
      ? { isIncomplete: true, items }
      : items)
    const source = 'main() { ans }\n//          ^|\n'
    const result = await analyze(source, session)
    expect(session.complete).toHaveBeenCalledExactlyOnceWith({ line: 0, character: 12 }, expect.any(AbortSignal), 'index.cj')
    expect(result.code).toBe('main() { ans }\n')
    expect(result.completions).toEqual([
      {
        type: 'completion',
        start: 12,
        length: 0,
        line: 0,
        character: 12,
        completionsPrefix: 'ans',
        completions: [
          { name: 'answer', kind: 'var' },
        ],
      },
    ])
    expect(result.meta.positionCompletions).toEqual([12])
  })

  it('preserves trigger characters, optional kinds, and LSP item defaults', async () => {
    const session = createSession()
    session.complete.mockResolvedValue({
      isIncomplete: false,
      itemDefaults: { insertTextFormat: 1 },
      items: [
        { label: 'size', kind: CompletionItemKind.Property },
        { label: 'get', kind: CompletionItemKind.Method },
        { label: 'unknown' },
      ],
    } satisfies CompletionList)
    const source = 'main() { values. }\n//              ^|\n'
    const result = await analyze(source, session)
    expect(result.completions[0]).toMatchObject({
      completionsPrefix: '.',
      completions: [
        { name: 'size', kind: 'property' },
        { name: 'get', kind: 'method' },
        { name: 'unknown' },
      ],
    })
  })

  it('handles Unicode prefixes, EOF cursors, and output cropping', async () => {
    const session = createSession()
    session.complete.mockResolvedValue([
      { label: '答案()', filterText: '答案', kind: CompletionItemKind.Function },
    ])
    const source = '// ---cut---\nmain() { 答'
    const result = await analyze(source, session, {
      positionCompletions: [source.length],
    })
    expect(result.completions[0]).toMatchObject({
      start: result.code.length,
      line: 0,
      character: 'main() { 答'.length,
      completionsPrefix: '答',
      completions: [
        { name: '答案()', kind: 'function' },
      ],
    })
  })

  it.each([
    null,
    [],
    { isIncomplete: false, items: [] },
  ])('validates empty completion results: %j', async (response) => {
    const session = createSession()
    session.complete.mockResolvedValue(response)
    const source = 'main() { x }\n//        ^|\n'
    await expect(analyze(source, session)).rejects.toMatchObject({ code: 'INVALID_COMPLETION' })
    const result = await analyze(source, session, {
      handbookOptions: { noErrorValidation: true, noStaticSemanticInfo: true },
    })
    expect(result.completions).toHaveLength(1)
    expect(result.completions[0].completions).toEqual([])
  })
})

describe('multiple source files', () => {
  it.each(['\n', '\r\n', '\r'])('routes requests locally and returns global coordinates with %j endings', async (ending) => {
    const session = createSession()
    const source = [
      '// @filename: data.cj',
      'let answer = 42',
      '//  ^?',
      '// @filename: main.cj',
      'main() { ans }',
      '//          ^|',
      '',
    ].join(ending)
    session.update.mockImplementation(async (_content, _signal, filename) => ({
      tokens: filename === 'data.cj'
        ? [0, 4, 6, 0, 0]
        : [],
      tokenTypes: ['variable'],
      diagnostics: filename === 'main.cj'
        ? [
            {
              ...diagnostic,
              range: {
                start: { line: 0, character: 9 },
                end: { line: 0, character: 12 },
              },
            },
          ]
        : [],
    }))
    session.hover.mockResolvedValue(answerHover())
    session.complete.mockResolvedValue([
      { label: 'answer', kind: CompletionItemKind.Variable },
    ])
    const shouldGetHoverInfo = vi.fn(() => true)
    const result = await analyze(source, session, {
      shouldGetHoverInfo,
      handbookOptions: {
        errors: [731],
      },
    })
    expect(session.update.mock.calls.map(([content, , filename]) => [filename, content])).toEqual([
      ['data.cj', `let answer = 42${ending}//  ^?${ending}`],
      ['main.cj', `main() { ans }${ending}//          ^|${ending}`],
    ])
    expect(session.hover).toHaveBeenCalledExactlyOnceWith({ line: 0, character: 4 }, expect.any(AbortSignal), 'data.cj')
    expect(session.complete).toHaveBeenCalledExactlyOnceWith({ line: 0, character: 12 }, expect.any(AbortSignal), 'main.cj')
    expect(shouldGetHoverInfo).toHaveBeenCalledWith('answer', source.indexOf('answer'), 'data.cj')
    expect(result.queries[0]).toMatchObject({
      start: result.code.indexOf('answer'),
      line: 1,
      character: 4,
      target: 'answer',
    })
    expect(result.completions[0]).toMatchObject({ start: result.code.indexOf('ans }') + 3, line: 3, character: 12 })
    expect(result.errors[0]).toMatchObject({
      filename: 'main.cj',
      start: result.code.indexOf('ans }'),
      line: 3,
      character: 9,
    })
    expect(result.meta.positionCompletions).toEqual([source.indexOf('ans }') + 3])
  })

  it('removes a complete hidden file while preserving errors and queries in the next file', async () => {
    const session = createSession()
    const source = '// @filename: data.cj\nlet answer = 42\n// ---cut---\n// @filename: main.cj\nmain() { println(answer) }\n//               ^?\n'
    session.hover.mockResolvedValue({
      contents: 'Int64',
      range: {
        start: { line: 0, character: 17 },
        end: { line: 0, character: 23 },
      },
    })
    const result = await analyze(source, session)
    expect(result.code).toBe('// @filename: main.cj\nmain() { println(answer) }\n')
    expect(result.queries[0]).toMatchObject({
      line: 1,
      character: 17,
      start: result.code.indexOf('answer'),
    })
    expect(session.hover).toHaveBeenCalledWith({ line: 0, character: 17 }, expect.any(AbortSignal), 'main.cj')
  })
})

describe('diagnostic nodes', () => {
  it.each([
    [1, 'error'],
    [2, 'warning'],
    [3, 'message'],
    [4, 'suggestion'],
    [undefined, 'error'],
  ] as const)('maps severity %s to %s', async (severity, level) => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [
        { ...diagnostic, severity },
      ],
      tokens: [],
      tokenTypes: [],
    })
    const result = await analyze(code, session, {
      handbookOptions: {
        errors: ['731'],
      },
    })
    expect(result.errors).toEqual([
      {
        type: 'error',
        start: 4,
        length: 6,
        code: 731,
        level,
        text: 'mismatched types',
        filename: 'index.cj',
        id: 'err-731-4-6',
        line: 0,
        character: 4,
      },
    ])
  })

  it('retains markup diagnostic messages and zero-length ranges', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [
        {
          ...diagnostic,
          code: 0,
          message: { kind: 'markdown', value: 'Unused variable' },
          range: { start: answerRange.start, end: answerRange.start },
        },
      ],
      tokens: [],
      tokenTypes: [],
    })
    const result = await analyze(code, session, {
      handbookOptions: { noErrorValidation: true },
    })
    expect(result.errors[0]).toMatchObject({
      text: 'Unused variable',
      code: 0,
      start: 4,
      length: 0,
    })
  })

  it.each([
    true,
    [731],
    ['731'],
  ])('suppresses diagnostics using noErrors=%j', async (noErrors) => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [diagnostic],
      tokens: [],
      tokenTypes: [],
    })
    expect((await analyze(code, session, {
      handbookOptions: { noErrors },
    })).errors).toEqual([])
  })

  it('suppresses only selected diagnostic codes', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [
        diagnostic,
        { ...diagnostic, code: 'other' },
      ],
      tokens: [],
      tokenTypes: [],
    })
    const result = await analyze(code, session, {
      handbookOptions: {
        noErrors: [731],
        errors: ['other'],
      },
    })
    expect(result.errors.map(node => node.code)).toEqual(['other'])
  })

  it('reports unexpected diagnostics using original coordinates before cropping', async () => {
    const session = createSession()
    const source = `// @note: hidden\n${code}`
    session.update.mockResolvedValue({
      diagnostics: [
        {
          ...diagnostic,
          range: {
            start: { line: 1, character: 4 },
            end: { line: 1, character: 10 },
          },
        },
      ],
      tokens: [],
      tokenTypes: [],
    })
    const error = await analyze(source, session, {
      customTags: ['note'],
    }).catch(error => error)
    expect(error).toBeInstanceOf(CjslashError)
    expect(error).toMatchObject({
      code: 'UNEXPECTED_DIAGNOSTIC',
      diagnostics: [
        expect.objectContaining({
          code: 731,
          start: source.indexOf('answer'),
          line: 1,
          character: 4,
        }),
      ],
    })
    expect(error.message).toContain('731 at 2:5')
  })

  it('validates diagnostics without a code and honors noErrorValidation', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [
        { ...diagnostic, code: undefined },
      ],
      tokens: [],
      tokenTypes: [],
    })
    await expect(analyze(code, session)).rejects.toMatchObject({ code: 'UNEXPECTED_DIAGNOSTIC' })
    expect((await analyze(code, session, {
      handbookOptions: { noErrorValidation: true },
    })).errors[0].code).toBeUndefined()
  })

  it('validates hidden diagnostics unless noErrorsCutted is enabled', async () => {
    const session = createSession()
    const source = `${code}// ---cut---\nmain() {}\n`
    session.update.mockResolvedValue({
      diagnostics: [diagnostic],
      tokens: [],
      tokenTypes: [],
    })
    await expect(analyze(source, session)).rejects.toMatchObject({ code: 'UNEXPECTED_DIAGNOSTIC' })
    const result = await analyze(source, session, {
      handbookOptions: { noErrorsCutted: true },
    })
    expect(result.code).toBe('main() {}\n')
    expect(result.errors).toEqual([])
  })

  it('filters nodes before unexpected-diagnostic validation', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [diagnostic],
      tokens: [],
      tokenTypes: [],
    })
    const filterNode = vi.fn<NonNullable<CjslashExecuteOptions['filterNode']>>(() => false)
    expect((await analyze(code, session, { filterNode })).nodes).toEqual([])
    expect(filterNode.mock.calls[0][0]).toMatchObject({ type: 'error', start: 4, code: 731 })
  })
})

describe('output and metadata', () => {
  it.each(['\n', '\r\n', '\r'])('crops code and relocates nodes while retaining metadata with %j endings', async (ending) => {
    const source = [
      '// ---cut-start---',
      'let hidden = 0',
      '// ---cut-end---',
      '// @note: important',
      'let answer = 42',
      '//  ^?',
      '//  ^^^^^^ answer',
      '',
    ].join(ending)
    const session = createSession()
    session.hover.mockResolvedValue({
      contents: 'Int64',
      range: {
        start: { line: 4, character: 4 },
        end: { line: 4, character: 10 },
      },
    })
    const options = {
      customTags: ['note'],
    }
    const parsed = parseSource(source, options)
    const removals = structuredClone(parsed.removals)
    const result = await analyzeSource(source, parsed, session, options, new AbortController().signal)
    expect(result.code).toBe(`let answer = 42${ending}`)
    expect(result.queries[0]).toMatchObject({ start: 4, line: 0, character: 4 })
    expect(result.highlights[0]).toMatchObject({ start: 4, length: 6, text: 'answer' })
    expect(result.tags[0]).toMatchObject({
      start: 0,
      line: 0,
      character: 0,
      name: 'note',
    })
    expect(result.meta.removals).toEqual(removals)
    expect(result.meta.positionQueries).toEqual([
      source.indexOf('answer'),
    ])
    expect(result.meta.positionHighlights).toEqual([
      [
        source.indexOf('answer'),
        source.indexOf('answer') + 6,
        'answer',
      ],
    ])
  })

  it('keeps notation and original positions when requested', async () => {
    const source = `// @keepNotations\n${code}`
    const session = createSession()
    const result = await analyze(source, session, {
      positionHighlights: [
        [
          source.indexOf('answer'),
          source.indexOf('answer') + 6,
        ],
      ],
    })
    expect(result.code).toBe(source)
    expect(result.highlights[0]).toMatchObject({
      start: source.indexOf('answer'),
      line: 1,
      character: 4,
    })
    expect(result.meta.removals).toHaveLength(1)
  })

  it('does not request automatic hovers inside hidden code', async () => {
    const source = 'let answer = 42\n// ---cut---\nmain() {}\n'
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [],
      tokens: [0, 4, 6, 0, 0],
      tokenTypes: ['variable'],
    })
    expect((await analyze(source, session)).hovers).toEqual([])
    expect(session.hover).not.toHaveBeenCalled()
  })

  it('derives every node view dynamically from nodes', async () => {
    const session = createSession()
    const result = await analyze(code, session)
    const completion: NodeCompletion = {
      type: 'completion',
      start: 4,
      length: 0,
      line: 0,
      character: 4,
      completions: [
        { name: 'answer' },
      ],
      completionsPrefix: 'ans',
    }
    result.nodes.push(
      {
        type: 'hover',
        ...answerRange.start,
        start: 4,
        length: 6,
        target: 'answer',
        text: 'Int64',
      },
      {
        type: 'query',
        ...answerRange.start,
        start: 4,
        length: 6,
        target: 'answer',
        text: 'Int64',
      },
      {
        type: 'error',
        ...answerRange.start,
        start: 4,
        length: 6,
        text: 'error',
      },
      {
        type: 'highlight',
        ...answerRange.start,
        start: 4,
        length: 6,
      },
      {
        type: 'tag',
        ...answerRange.start,
        start: 4,
        length: 0,
        name: 'note',
      },
      completion,
    )
    for (const view of [
      result.hovers,
      result.queries,
      result.errors,
      result.highlights,
      result.tags,
      result.completions,
    ])
      expect(view).toHaveLength(1)
    expect(result.completions[0]).toBe(completion)
    result.nodes = []
    expect([
      result.hovers,
      result.queries,
      result.errors,
      result.highlights,
      result.tags,
      result.completions,
    ]).toEqual([[], [], [], [], [], []])
  })
})
