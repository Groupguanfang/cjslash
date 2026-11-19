import type { CjslashExecuteOptions } from '../src/types'
import { removeCodeRanges } from '@cjslash/protocol'
import { CjslashError } from '../src/error'
import { isRemoved, parseSource, resolveHandbookOptions } from '../src/source'

describe('source removal ranges', () => {
  it('treats removal ranges as half-open', () => {
    expect(isRemoved(3, [
      [3, 6],
    ])).toBe(true)
    expect(isRemoved(5, [
      [3, 6],
    ])).toBe(true)
    expect(isRemoved(6, [
      [3, 6],
    ])).toBe(false)
    expect(isRemoved(2, [
      [3, 6],
    ])).toBe(false)
    expect(isRemoved(3, [
      [3, 3],
    ])).toBe(false)
  })
})

describe('source annotations', () => {
  it('parses TOML field paths and values, removes annotations, and preserves source coordinates', () => {
    const source = 'package example\n// @package.version: "0.2.0"\n// @package.src-dir: "examples"\n// @profile.build.incremental\n// @dependencies."org::example": { version = "1.0.0" }\nlet answer = 42\n//  ^?\n'
    const options: CjslashExecuteOptions = {
      cjpmToml: {
        package: { version: '0.1.0', description: 'retained' },
        profile: {
          build: { incremental: false },
        },
      },
    }
    const parsed = parseSource(source, options)
    expect(parsed.cjpmToml).toEqual({
      package: { 'version': '0.2.0', 'description': 'retained', 'src-dir': 'examples' },
      profile: {
        build: { incremental: true },
      },
      dependencies: {
        'org::example': { version: '1.0.0' },
      },
    })
    expect(parsed.positionQueries).toEqual([
      source.indexOf('answer'),
    ])
    expect(removeCodeRanges(source, parsed.removals).code).toBe('package example\nlet answer = 42\n')
    expect(options.cjpmToml?.package?.version).toBe('0.1.0')
  })

  it('keeps the last field override and replaces arrays without sharing mutable values', () => {
    const parsed = parseSource('// @package.version: "0.2.0"\n// @package.version: "0.3.0"\n// @bin-dependencies.path-option: ["./new"]\n', {
      cjpmToml: {
        'bin-dependencies': {
          'path-option': ['./old'],
        },
      },
    })
    expect(parsed.cjpmToml).toEqual({
      'package': { version: '0.3.0' },
      'bin-dependencies': {
        'path-option': ['./new'],
      },
    })
  })

  it('does not parse manifest annotations inside strings or block comments', () => {
    const source = 'let message = """\n// @package.version: "ignored"\n"""\n/*\n// @dependencies.fake: "1.0.0"\n*/\n'
    expect(parseSource(source, {}).cjpmToml).toEqual({})
  })

  it.each([
    '// @package.version: "unterminated',
    '// @dependencies.extra: { git = "missing brace"',
    '// @package: false',
  ])('reports malformed manifest override %j with a cause', (source) => {
    expect(() => parseSource(source, {})).toThrowError(expect.objectContaining({
      code: 'INVALID_CJPM_TOML',
      cause: expect.any(Error),
    }))
  })

  it('resolves handbook defaults and clones caller-owned arrays', () => {
    const options = {
      errors: [731],
      noErrors: ['hint'],
    }
    const resolved = resolveHandbookOptions(options)
    expect(resolved).toEqual({
      errors: [731],
      noErrors: ['hint'],
      noErrorValidation: false,
      noStaticSemanticInfo: false,
      keepNotations: false,
      noErrorsCutted: false,
    })
    expect(resolved.errors).not.toBe(options.errors)
    expect(resolved.noErrors).not.toBe(options.noErrors)
  })

  it('resolves defaults without modifying caller-owned arrays', () => {
    const options: CjslashExecuteOptions = {
      handbookOptions: {
        errors: [731],
        noErrors: ['hint'],
      },
      positionQueries: [4],
      positionHighlights: [
        [4, 10, 'answer'],
      ],
    }
    const snapshot = structuredClone(options)
    const parsed = parseSource('let answer = 42', options)
    expect(parsed.handbookOptions).toEqual({
      errors: [731],
      noErrors: ['hint'],
      noErrorValidation: false,
      noStaticSemanticInfo: false,
      keepNotations: false,
      noErrorsCutted: false,
    })
    parsed.handbookOptions.errors.push(732)
    if (Array.isArray(parsed.handbookOptions.noErrors)) parsed.handbookOptions.noErrors.push('other')
    parsed.positionQueries.push(5)
    parsed.positionHighlights[0][0] = 0
    expect(options).toEqual(snapshot)
  })

  it('resolves consecutive markers against the same preceding code line', () => {
    const parsed = parseSource('let answer = 42\n//  ^?\n//   ^?\n//  ^^^^^^ explanation\n', {
      positionQueries: [4],
    })
    expect(parsed.positionQueries).toEqual([4, 5])
    expect(parsed.positionHighlights).toEqual([
      [4, 10, 'explanation'],
    ])
    expect(parsed.nodes).toContainEqual({
      type: 'highlight',
      start: 4,
      length: 6,
      text: 'explanation',
    })
    expect(removeCodeRanges('let answer = 42\n//  ^?\n//   ^?\n//  ^^^^^^ explanation\n', parsed.removals).code).toBe('let answer = 42\n')
  })

  it.each(['\n', '\r\n', '\r'])('preserves query and removal offsets with %j endings', (ending) => {
    const code = [
      'let hidden = 0',
      '// ---cut---',
      'let answer = 42',
      '//  ^?',
    ].join(ending)
    const parsed = parseSource(code, {})
    expect(parsed.positionQueries).toEqual([
      code.indexOf('answer'),
    ])
    expect(removeCodeRanges(code, parsed.removals).code).toBe(`let answer = 42${ending}`)
  })

  it('preserves annotations and UTF-16 offsets with mixed line endings', () => {
    const code = `// ordinary\r// @note: important\r\n// @noStaticSemanticInfo\nlet text = "中文😀"; let answer = 42\r//${' '.repeat(21)}^?\r\n`
    const parsed = parseSource(code, {
      customTags: ['note'],
    })
    expect(parsed.handbookOptions.noStaticSemanticInfo).toBe(true)
    expect(parsed.positionQueries).toEqual([
      code.indexOf('answer'),
    ])
    expect(parsed.nodes).toContainEqual({
      type: 'tag',
      name: 'note',
      text: 'important',
      start: code.indexOf('// @noStaticSemanticInfo'),
      length: 0,
    })
    expect(removeCodeRanges(code, parsed.removals).code).toBe('// ordinary\rlet text = "中文😀"; let answer = 42\r')
  })

  it.each(['\n', '\r\n', '\r'])('rejects markers beyond the visible line with %j endings', (ending) => {
    expect(() => parseSource(`abc${ending}//  ^?`, {})).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }))
  })

  it('lets annotations override defaults and accepts numeric and string codes', () => {
    const parsed = parseSource('// @errors: 731 E001 007\n// @noErrors: 0 E002\nlet answer = 42', {
      handbookOptions: {
        errors: [999],
        noErrors: true,
      },
    })
    expect(parsed.handbookOptions.errors).toEqual([731, 'E001', '007'])
    expect(parsed.handbookOptions.noErrors).toEqual([0, 'E002'])
  })

  it.each([
    ['// @noErrors', true],
    ['// @noErrors: true', true],
    ['// @noErrors: false', false],
    ['// @noErrors:', []],
  ] as const)('parses %s', (annotation, value) => {
    expect(parseSource(`${annotation}\n`, {}).handbookOptions.noErrors).toEqual(value)
  })

  it.each([
    'noErrorValidation',
    'noStaticSemanticInfo',
    'keepNotations',
    'noErrorsCutted',
  ] as const)('parses boolean @%s values', (name) => {
    expect(parseSource(`// @${name}\n`, {}).handbookOptions[name]).toBe(true)
    expect(parseSource(`// @${name}: true\n`, {}).handbookOptions[name]).toBe(true)
    expect(parseSource(`// @${name}: false\n`, {}).handbookOptions[name]).toBe(false)
    expect(() => parseSource(`// @${name}: invalid\n`, {})).toThrow(expect.objectContaining({ code: 'INVALID_NOTATION' }))
  })

  it('extracts registered tags and leaves ordinary comments intact', () => {
    const code = '// @note: hello\nlet answer = 42\n// @note\n// @unknown - ordinary comment\n'
    const parsed = parseSource(code, {
      customTags: ['note'],
    })
    expect(parsed.nodes).toEqual([
      {
        type: 'tag',
        name: 'note',
        text: 'hello',
        start: code.indexOf('let'),
        length: 0,
      },
      {
        type: 'tag',
        name: 'note',
        text: undefined,
        start: code.indexOf('// @unknown'),
        length: 0,
      },
    ])
    expect(removeCodeRanges(code, parsed.removals).code).toBe('let answer = 42\n// @unknown - ordinary comment\n')
  })

  it.each([
    '"// @unknown"',
    '\'// @unknown\'',
    '"""\n// @unknown\n// ^?\n"""',
    '\'\'\'\n// @unknown\n\'\'\'',
    '##"\n// @unknown\n"#\n// @stillLiteral\n"##',
    '"escaped \\"// @unknown"',
    '/*\n// @unknown\n/* nested */\n// ^?\n*/',
    '/* unterminated\n// @unknown',
    '"unterminated\n// @unknown',
  ])('ignores annotation-like content in %j', (literal) => {
    const parsed = parseSource(`let text = ${literal}`, {})
    expect(parsed.removals).toEqual([])
    expect(parsed.nodes).toEqual([])
    expect(parsed.positionQueries).toEqual([])
  })

  it('continues scanning after strings, nested comments, and ordinary line comments', () => {
    const code = '"// ignored" /* outer /* nested */ */ // ordinary\n// @noErrors\nlet answer = 42\n//  ^?\n'
    const parsed = parseSource(code, {})
    expect(parsed.handbookOptions.noErrors).toBe(true)
    expect(parsed.positionQueries).toEqual([
      code.indexOf('answer'),
    ])
  })

  it.each([
    ['// ---cut---', 'let shown = 1\n'],
    ['// ---cut-before---', 'let shown = 1\n'],
    ['// ---cut-after---', 'let hidden = 0\n'],
  ])('handles %s', (marker, expected) => {
    const code = `let hidden = 0\n${marker}\nlet shown = 1\n`
    expect(removeCodeRanges(code, parseSource(code, {}).removals).code).toBe(expected)
  })

  it('merges nested and adjacent cut ranges, including an EOF marker', () => {
    const code = 'before\n// ---cut-start---\nouter\n// ---cut-start---\ninner\n// ---cut-end---\n// ---cut-end---\nafter\n// ---cut-start---\nhidden\n// ---cut-end---'
    const parsed = parseSource(code, {})
    expect(parsed.removals).toHaveLength(2)
    expect(removeCodeRanges(code, parsed.removals).code).toBe('before\nafter\n')
  })

  it.each([
    ['// ---cut-start---', 'INVALID_NOTATION'],
    ['// ---cut-end---', 'INVALID_NOTATION'],
    ['// @errors', 'INVALID_NOTATION'],
    ['// @unknown', 'UNSUPPORTED_FEATURE'],
    ['// ^?', 'INVALID_QUERY'],
    ['// ^|', 'INVALID_COMPLETION'],
    ['let x = 1\n//                        ^?', 'INVALID_QUERY'],
    ['let x = 1\n//                        ^|', 'INVALID_COMPLETION'],
  ])('rejects invalid or unsupported notation %j', (code, expected) => {
    expect(() => parseSource(code, {})).toThrow(expect.objectContaining({ name: 'CjslashError', code: expected }))
  })

  it.each([
    -1,
    100,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects query offset %s', (offset) => {
    expect(() => parseSource('let answer = 42', {
      positionQueries: [offset],
    })).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }))
  })

  it('rejects queries in removed ranges and at EOF', () => {
    expect(() => parseSource('let hidden = 0\n// ---cut---\nmain() {}', {
      positionQueries: [4],
    })).toThrow(CjslashError)
    expect(() => parseSource('main() {}', {
      positionQueries: [9],
    })).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }))
  })

  it.each([
    [-1, 3],
    [5, 4],
    [0, 100],
    [1.5, 4],
    [0, Number.NaN],
  ])('rejects invalid highlight range [%s, %s)', (start, end) => {
    expect(() => parseSource('let answer = 42', {
      positionHighlights: [
        [start, end],
      ],
    })).toThrow(expect.objectContaining({ code: 'INVALID_NOTATION' }))
  })

  it('accepts a zero-length highlight at EOF', () => {
    expect(parseSource('main() {}', {
      positionHighlights: [
        [9, 9, 'end'],
      ],
    }).nodes).toEqual([
      {
        type: 'highlight',
        start: 9,
        length: 0,
        text: 'end',
      },
    ])
  })
})

describe('completion markers and source files', () => {
  it.each(['\n', '\r\n', '\r'])('parses and deduplicates completion cursor positions with %j endings', (ending) => {
    const code = [
      'let answer = 42',
      '//       ^|',
      '//  ^?',
      '',
    ].join(ending)
    const parsed = parseSource(code, {
      positionCompletions: [9],
    })
    expect(parsed.positionCompletions).toEqual([9])
    expect(parsed.positionQueries).toEqual([4])
    expect(removeCodeRanges(code, parsed.removals).code).toBe(`let answer = 42${ending}`)
  })

  it('accepts a completion cursor at EOF and clones caller-owned positions', () => {
    const code = 'main() { ans'
    const positions = [code.length]
    const parsed = parseSource(code, { positionCompletions: positions })
    parsed.positionCompletions.push(0)
    expect(positions).toEqual([code.length])
  })

  it.each([
    -1,
    999,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid completion offset %s', (offset) => {
    expect(() => parseSource('main() {}', {
      positionCompletions: [offset],
    })).toThrow(expect.objectContaining({ code: 'INVALID_COMPLETION' }))
  })

  it('rejects completion positions inside hidden source', () => {
    expect(() => parseSource('let answer = 42\n// ---cut---\nmain() {}', {
      positionCompletions: [4],
    })).toThrow(expect.objectContaining({ code: 'INVALID_COMPLETION' }))
  })

  it.each(['\n', '\r\n', '\r'])('splits named files with original offsets and package paths with %j endings', (ending) => {
    const code = [
      '// @noErrors',
      '// @filename: models/value.cj',
      'package example.models',
      'public let value = 42',
      '// @filename: main.cj',
      'package example',
      'main() {}',
    ].join(ending)
    const parsed = parseSource(code, {})
    expect(parsed.handbookOptions.noErrors).toBe(true)
    expect(parsed.files).toHaveLength(2)
    expect(parsed.files[0]).toMatchObject({
      filename: 'models/value.cj',
      offset: code.indexOf('package'),
      content: `package example.models${ending}public let value = 42${ending}`,
      packageInfo: { name: 'example.models', moduleName: 'example', sourcePath: 'src/models/value.cj' },
    })
    expect(parsed.files[1]).toMatchObject({
      filename: 'main.cj',
      offset: code.lastIndexOf('package'),
      content: `package example${ending}main() {}`,
      packageInfo: { sourcePath: 'src/main.cj' },
    })
    expect(parsed.files[1].document.positionAt('package example'.length + ending.length)).toEqual({ line: 1, character: 0 })
    expect(removeCodeRanges(code, parsed.removals).code).toContain('// @filename: models/value.cj')
  })

  it('supports implicit source and multiple files within the same package', () => {
    const parsed = parseSource('let answer = 42\n// @filename: main.cj\nmain() {}', {})
    expect(parsed.files.map(file => file.filename)).toEqual(['index.cj', 'main.cj'])
    const nested = parseSource('// @filename: one.cj\npackage example.models\nlet one = 1\n// @filename: two.cj\npackage example.models\nlet two = 2', {})
    expect(nested.files.map(file => file.packageInfo.sourcePath)).toEqual(['src/models/one.cj', 'src/models/two.cj'])
  })

  it.each([
    '// @filename',
    '// @filename:',
    '// @filename: /tmp/main.cj',
    '// @filename: C:\\main.cj',
    '// @filename: ../main.cj',
    '// @filename: models/../../main.cj',
    '// @filename: models\\..\\main.cj',
    '// @filename: main.ts',
    '// @filename: models/main.cj\npackage example',
    '// @filename: value.cj\nlet x = 1\n// @filename: value.cj\nlet y = 2',
    '// @filename: value.cj\npackage example.models\nlet x = 1\n// @filename: models/value.cj\npackage example.models\nlet y = 2',
    '// @filename: one.cj\npackage one\n// @filename: two.cj\npackage two',
  ])('rejects invalid file notation %j', (source) => {
    expect(() => parseSource(source, {})).toThrow(expect.objectContaining({ code: 'INVALID_NOTATION' }))
  })

  it('does not parse filenames inside strings or allow queries to cross file boundaries', () => {
    const code = 'let literal = """\n// @filename: fake.cj\n"""\n// @filename: real.cj\nmain() {}'
    expect(parseSource(code, {}).files.map(file => file.filename)).toEqual(['index.cj', 'real.cj'])
    expect(() => parseSource('// @filename: one.cj\n//  ^?\nlet x = 1', {})).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }))
    const source = 'let x = 1\n// @filename: main.cj\nmain() {}'
    expect(() => parseSource(source, {
      positionQueries: [
        source.indexOf('// @filename'),
      ],
    })).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }))
    expect(() => parseSource(source, {
      positionCompletions: [
        source.indexOf('@filename'),
      ],
    })).toThrow(expect.objectContaining({ code: 'INVALID_COMPLETION' }))
  })
})
