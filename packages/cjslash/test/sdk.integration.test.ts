import type { Cjslash } from '../src/types'
import fs from 'node:fs'
import process from 'node:process'
import path from 'pathe'
import { resolveCjpmToml } from '../src/cjpm'
import { CjslashError, createCjslasher } from '../src/index'

const sdkPath = process.env.CJSLASH_SDK_PATH || process.env.CANGJIE_HOME
const code = 'let answer = 42\n//  ^?\nmain() { println(answer) }\n'
const invalid = 'main() {\n    let value: Int64 = "bad"\n    println(value)\n}\n'

describe.skipIf(!sdkPath)('integration with the Cangjie SDK', () => {
  let analyzer: Cjslash

  beforeAll(async () => {
    analyzer = await createCjslasher({ sdkPath: sdkPath! })
  })

  afterAll(async () => {
    await analyzer?.[Symbol.asyncDispose]()
  })

  it('returns real hover and query information with notation removed', async () => {
    const result = await analyzer.analyze(code)
    expect(result.code).toBe('let answer = 42\nmain() { println(answer) }\n')
    expect(result.queries).toHaveLength(1)
    expect(result.queries[0]).toMatchObject({
      target: 'answer',
      start: 4,
      line: 0,
      character: 4,
    })
    expect(result.queries[0].text).toContain('Int64')
    expect(result.hovers.some(node => node.target === 'println')).toBe(true)
  })

  it('analyzes a root package declared at the top of an example', async () => {
    const root = await analyzer.analyze('package example\n\nmain() {\n    let answer = 42\n    println(answer)\n}\n')
    expect(root.errors).toEqual([])
  })

  it('analyzes a nested package declared at the top of an example', async () => {
    const nested = await analyzer.analyze('package example.models.user\n\nlet answer = 42\n//  ^?\nmain() { println(answer) }\n')
    expect(nested.errors).toEqual([])
    expect(nested.queries[0]).toMatchObject({
      target: 'answer',
      start: 33,
    })
    expect(nested.queries[0].text).toContain('Int64')
  })

  it('analyzes a declared package with a serialized configuration under a custom workspaceRoot', async () => {
    await using subscriptions = new AsyncDisposableStack()
    const parentDirectory = fs.mkdtempSync(path.resolve('.cjslash-sdk-test-'))
    subscriptions.defer((): void => fs.rmSync(parentDirectory, { recursive: true, force: true }))
    const workspaceRoot = path.join(parentDirectory, 'workspaces')
    await using cjslasher = await createCjslasher({
      sdkPath: sdkPath!,
      workspaceRoot,
      cjpmToml: {
        package: {
          name: 'overridden',
          version: '0.2.0',
          description: 'Custom project configuration',
        },
        dependencies: {},
      },
    })
    const result = await cjslasher.analyze('package example.models\n\nlet answer = 42\n//  ^?\nmain() { println(answer) }\n')
    expect(result.errors).toEqual([])
    expect(result.queries[0].text).toContain('Int64')
    expect(fs.readdirSync(workspaceRoot)).toEqual([])
  })

  it('resolves an annotated local dependency with a custom source directory and returns its real type', async () => {
    await using subscriptions = new AsyncDisposableStack()
    const parentDirectory = fs.mkdtempSync(path.resolve('.cjslash-sdk-test-'))
    subscriptions.defer((): void => fs.rmSync(parentDirectory, { recursive: true, force: true }))
    const library = path.join(parentDirectory, 'library')
    fs.mkdirSync(path.join(library, 'src'), { recursive: true })
    fs.writeFileSync(path.join(library, 'cjpm.toml'), resolveCjpmToml('1.2.1', {}, 'library'))
    fs.writeFileSync(path.join(library, 'src/index.cj'), 'package library\npublic let answer = 42\n')
    await using cjslasher = await createCjslasher({
      sdkPath: sdkPath!,
      workspaceRoot: path.join(parentDirectory, 'workspaces'),
      autoInstallDependencies: false,
    })
    const source = [
      'package example',
      `// @dependencies.library: { path = ${JSON.stringify(library)} }`,
      '// @package.src-dir: "examples"',
      'import library.*',
      'let copied = answer',
      '//  ^?',
      'main() { println(copied) }',
      '',
    ].join('\n')
    const result = await cjslasher.analyze(source)
    expect(result.errors).toEqual([])
    expect(result.queries[0]).toMatchObject({ target: 'copied' })
    expect(result.queries[0].text).toContain('Int64')
    expect(result.code).not.toContain('@dependencies')
    await expect(cjslasher.analyze(code)).resolves.toHaveProperty('errors', [])
  })

  it('continues analyzing after the real CJPM command fails to install a dependency', async () => {
    await using subscriptions = new AsyncDisposableStack()
    const parentDirectory = fs.mkdtempSync(path.resolve('.cjslash-sdk-test-'))
    subscriptions.defer((): void => fs.rmSync(parentDirectory, { recursive: true, force: true }))
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => {})
    await using cjslasher = await createCjslasher({
      sdkPath: sdkPath!,
      workspaceRoot: path.join(parentDirectory, 'workspaces'),
    })
    const repository = path.join(parentDirectory, 'missing.git')
    const result = await cjslasher.analyze(`// @dependencies.missing: { git = ${JSON.stringify(repository)} }\n${code}`)
    expect(result.errors).toEqual([])
    expect(result.queries[0].text).toContain('Int64')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cannot install dependency missing'))
    await expect(cjslasher.analyze(code)).resolves.toHaveProperty('errors', [])
    expect(fs.readdirSync(path.join(parentDirectory, 'workspaces'))).toEqual(['cjslash-cache'])
  })

  it('returns real member completions and filters an identifier prefix', async () => {
    const source = '// @noErrors\nmain() {\n    let message = "hello"\n    message.si\n//            ^|\n}\n'
    const result = await analyzer.analyze(source)
    expect(result.completions).toHaveLength(1)
    expect(result.completions[0].completionsPrefix).toBe('si')
    expect(result.completions[0].completions.some(entry => entry.name.startsWith('si'))).toBe(true)
    expect(result.completions[0].completions.every(entry => entry.name.startsWith('si'))).toBe(true)
    expect(result.code).not.toContain('^|')
  })

  it('returns real member completions after a dot', async () => {
    const source = '// @noErrors\nmain() {\n    let message = "hello"\n    message.\n}\n'
    const result = await analyzer.analyze(source, 'cj', {
      positionCompletions: [source.indexOf('message.') + 'message.'.length],
      handbookOptions: { noStaticSemanticInfo: true },
    })
    expect(result.completions[0]).toMatchObject({ start: result.code.indexOf('message.') + 'message.'.length, completionsPrefix: '.' })
    expect(result.completions[0].completions).toContainEqual(expect.objectContaining({ name: 'size' }))
    expect(result.hovers).toEqual([])
  })

  it('analyzes multiple files in one package and resolves a cross-file query', async () => {
    const source = '// @filename: data.cj\nlet answer = 42\n// @filename: main.cj\nmain() { println(answer) }\n//               ^?\n'
    const result = await analyzer.analyze(source)
    expect(result.errors).toEqual([])
    expect(result.queries[0]).toMatchObject({
      target: 'answer',
      line: 3,
      character: 17,
      start: result.code.lastIndexOf('answer'),
    })
    expect(result.queries[0].text).toContain('Int64')
  })

  it('resolves imports from another package within the same module', async () => {
    const source = '// @filename: models/data.cj\npackage example.models\npublic let answer = 42\n// @filename: main.cj\npackage example\nimport example.models.*\nmain() { println(answer) }\n//               ^?\n'
    const result = await analyzer.analyze(source)
    expect(result.errors).toEqual([])
    expect(result.queries[0]).toMatchObject({ target: 'answer', line: 6, character: 17 })
    expect(result.queries[0].text).toContain('Int64')
  })

  it('reports real diagnostics with the named file and global source coordinates', async () => {
    const source = '// @errors: 731\n// @filename: data.cj\nlet answer: Int64 = "bad"\n// @filename: main.cj\nmain() { println(answer) }\n'
    const result = await analyzer.analyze(source)
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 731, filename: 'data.cj', line: 1 }))
  })

  it('reports unexpected diagnostics with original source positions', async () => {
    const failure = await analyzer.analyze(invalid).catch(error => error)
    expect(failure).toBeInstanceOf(CjslashError)
    expect(failure).toMatchObject({
      code: 'UNEXPECTED_DIAGNOSTIC',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 731, line: 1 }),
      ]),
    })
  })

  it('accepts expected diagnostics and does not reuse them for later clean input', async () => {
    const result = await analyzer.analyze(`// @errors: 731\n${invalid}`)
    expect(result.errors.some(node => node.code === 731)).toBe(true)
    expect((await analyzer.analyze(code)).errors).toEqual([])
  })

  it.each(['// @noErrors', '// @noErrors: 731'])('suppresses real diagnostics with %s', async (flag) => {
    expect((await analyzer.analyze(`${flag}\n${invalid}`)).errors).toEqual([])
  })

  it('retains diagnostics when validation is disabled', async () => {
    const result = await analyzer.analyze(`// @noErrorValidation\n${invalid}`)
    expect(result.errors.some(node => node.code === 731)).toBe(true)
  })

  it('removes hidden diagnostics and relocates visible queries after cutting', async () => {
    const source = '// @noErrorsCutted\nlet hidden: Int64 = "bad"\n// ---cut---\nlet answer = 42\n//  ^?\nmain() { println(answer) }\n'
    const result = await analyzer.analyze(source)
    expect(result.code).toBe('let answer = 42\nmain() { println(answer) }\n')
    expect(result.errors).toEqual([])
    expect(result.queries[0]).toMatchObject({ start: 4, line: 0, target: 'answer' })
    expect(result.queries[0].docs).toBeUndefined()
    expect(result.queries[0].text).not.toContain('---cut---')
  })

  it('removes manifest annotations from rendered code and hover documentation', async () => {
    const source = 'package example\n// @package.version: "0.2.0"\n// @package.src-dir: "examples"\n// @profile.build.incremental\nlet answer = 42\n//  ^?\nmain() { println(answer) }\n'
    const result = await analyzer.analyze(source)
    expect(result.code).toBe('package example\nlet answer = 42\nmain() { println(answer) }\n')
    expect(result.queries[0].docs).toBeUndefined()
    expect(result.queries[0].text).not.toContain('@package')
    expect(result.queries[0].text).not.toContain('@profile')
  })

  it('returns highlights and custom tags in output coordinates', async () => {
    const result = await analyzer.analyze('// @note: look here\nlet answer = 42\n//  ^^^^^^ important\nmain() { println(answer) }\n', 'cj', {
      customTags: ['note'],
    })
    expect(result.tags[0]).toMatchObject({ name: 'note', text: 'look here', start: 0 })
    expect(result.highlights[0]).toMatchObject({ start: 4, length: 6, text: 'important' })
  })

  it('preserves UTF-16 offsets with CRLF, Chinese text, and emoji', async () => {
    const source = 'main() {\r\n    let label = "中文😀"; let answer = 42\r\n    println(label)\r\n    println(answer)\r\n}\r\n'
    const result = await analyzer.analyze(source, 'cj', {
      positionQueries: [
        source.indexOf('answer'),
      ],
    })
    expect(result.code).toBe(source)
    expect(result.queries[0]).toMatchObject({
      start: source.indexOf('answer'),
      line: 1,
      character: source.split('\r\n')[1].indexOf('answer'),
      target: 'answer',
    })
  })

  it('refreshes real types when examples change or are repeated', async () => {
    const stringCode = code.replace('42', '"hello"')
    const results = await Promise.all([
      analyzer.analyze(code),
      analyzer.analyze(stringCode),
      analyzer.analyze(stringCode),
      analyzer.analyze(code),
    ])
    expect(results.map(result => result.queries[0].text.includes('Int64'))).toEqual([true, false, false, true])
    expect(results[1].queries[0].text).toContain('String')
  })

  it('preserves explicit queries with automatic hover disabled and notation kept', async () => {
    const result = await analyzer.analyze(code, 'cj', {
      handbookOptions: { keepNotations: true, noStaticSemanticInfo: true },
    })
    expect(result.code).toBe(code)
    expect(result.hovers).toEqual([])
    expect(result.queries).toHaveLength(1)
  })

  it('keeps the session usable after rejecting a cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(analyzer.analyze(code, 'cj', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect((await analyzer.analyze(code)).queries).toHaveLength(1)
  })

  it('closes the real process when await using leaves its scope', async () => {
    let disposed: Cjslash
    {
      await using scoped = await createCjslasher({ sdkPath: sdkPath! })
      expect((await scoped.analyze('main() {}')).errors).toEqual([])
      disposed = scoped
    }
    await expect(disposed.analyze('main() {}')).rejects.toMatchObject({ code: 'DISPOSED' })
    const cleanup = disposed[Symbol.asyncDispose]()
    expect(disposed[Symbol.asyncDispose]()).toBe(cleanup)
    await cleanup
  })
})
