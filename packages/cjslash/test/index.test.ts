import type { Cjslash, CjslashOptions } from '../src/types'
import path from 'pathe'
import { CjslashError, createCjslasher } from '../src/index'
import { createLspSession } from '../src/lsp'
import { resolveSdk } from '../src/sdk'
import { abortOnSignal, createSession } from './helpers'

vi.mock('../src/sdk', () => ({
  resolveSdk: vi.fn(),
}))
vi.mock('../src/lsp', () => ({
  createLspSession: vi.fn(),
}))

const sdk = {
  root: '/resolved/cangjie',
  version: '1.2.1',
  env: {},
  serverPath: '/resolved/cangjie/tools/bin/LSPServer',
}
const analyzers: Cjslash[] = []

async function create(options: Partial<CjslashOptions> = {}) {
  const analyzer = await createCjslasher({ sdkPath: './sdk', ...options })
  analyzers.push(analyzer)
  return analyzer
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveSdk).mockResolvedValue(sdk)
  vi.mocked(createLspSession).mockImplementation(async () => createSession())
})

afterEach(async () => {
  await Promise.all(analyzers.splice(0).map(analyzer => analyzer[Symbol.asyncDispose]()))
})

describe('createCjslasher', () => {
  it('resolves the SDK and freezes creation options without starting the LSP', async () => {
    const cjpmToml = {
      dependencies: { stdx: '1.0.0' },
    }
    const options = {
      sdkPath: './sdk',
      workspaceRoot: './.cjslash',
      timeout: 1234,
      platform: 'linux',
      arch: 'x64',
      cjpmToml,
    } as const
    const analyzer = await createCjslasher(options)
    analyzers.push(analyzer)
    expect(resolveSdk).toHaveBeenCalledWith('./sdk', 1234, 'linux', 'x64')
    expect(createLspSession).not.toHaveBeenCalled()
    expect(analyzer.options).toEqual({
      sdkPath: sdk.root,
      autoInstallDependencies: true,
      workspaceRoot: path.resolve('./.cjslash'),
      timeout: 1234,
      platform: 'linux',
      arch: 'x64',
      cjpmToml,
    })
    expect(Object.isFrozen(analyzer.options)).toBe(true)
    expect(options).toEqual({
      sdkPath: './sdk',
      workspaceRoot: './.cjslash',
      timeout: 1234,
      platform: 'linux',
      arch: 'x64',
      cjpmToml,
    })
  })

  it('uses a 30-second default timeout', async () => {
    await create()
    expect(resolveSdk).toHaveBeenCalledWith('./sdk', 30_000, undefined, undefined)
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2_147_483_648,
  ])('rejects timeout %s before resolving the SDK', async (timeout) => {
    await expect(create({ timeout })).rejects.toBeInstanceOf(RangeError)
    expect(resolveSdk).not.toHaveBeenCalled()
    expect(createLspSession).not.toHaveBeenCalled()
  })

  it('preserves SDK failures without starting the LSP', async () => {
    const cause = new Error('SDK missing')
    const failure = new CjslashError('SDK_NOT_FOUND', 'Cannot resolve SDK', { cause })
    vi.mocked(resolveSdk).mockRejectedValue(failure)
    await expect(create()).rejects.toBe(failure)
    expect(failure.cause).toBe(cause)
    expect(createLspSession).not.toHaveBeenCalled()
  })
})

describe('analysis lifecycle', () => {
  it('creates and disposes one session per analysis with the declared package', async () => {
    const session = createSession()
    vi.mocked(createLspSession).mockResolvedValueOnce(session)
    const cjpmToml = {
      dependencies: { stdx: '1.0.0' },
    }
    const analyzer = await create({ cjpmToml, workspaceRoot: './.cjslash' })
    const code = 'package example.models\n\nmain() {}\n'
    const result = await analyzer.analyze(code)
    expect(createLspSession).toHaveBeenCalledExactlyOnceWith(sdk, 30_000, {
      signal: expect.any(AbortSignal),
      cjpmToml,
      workspaceRoot: path.resolve('./.cjslash'),
      autoInstallDependencies: true,
      files: [
        expect.objectContaining({
          filename: 'index.cj',
          content: code,
          offset: 0,
          packageInfo: {
            name: 'example.models',
            moduleName: 'example',
            sourcePath: 'src/models/index.cj',
          },
        }),
      ],
    })
    expect(session.update).toHaveBeenCalledExactlyOnceWith(code, expect.any(AbortSignal), 'index.cj')
    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(result.code).toBe(code)
  })

  it('merges instance defaults, execution options, and source annotations in that order', async () => {
    const session = createSession()
    session.update.mockResolvedValue({
      diagnostics: [
        {
          code: 731,
          message: 'mismatched types',
          range: {
            start: { line: 2, character: 4 },
            end: { line: 2, character: 10 },
          },
        },
      ],
      tokens: [],
      tokenTypes: [],
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(session)
    const analyzer = await create({
      handbookOptions: { noErrors: true, noStaticSemanticInfo: true },
      customTags: ['old'],
      positionHighlights: [
        [0, 1],
      ],
    })
    const source = '// @errors: 731\n// @note: new\nlet answer = 42\n'
    const result = await analyzer.analyze(source, 'cj', {
      handbookOptions: { noErrors: false },
      customTags: ['note'],
      positionHighlights: [
        [
          source.indexOf('answer'),
          source.indexOf('answer') + 6,
        ],
      ],
    })
    expect(result.meta.handbookOptions).toMatchObject({
      errors: [731],
      noErrors: false,
      noStaticSemanticInfo: true,
    })
    expect(result.tags).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.highlights[0]).toMatchObject({ start: 4, length: 6 })
    expect(analyzer.options.handbookOptions).toEqual({ noErrors: true, noStaticSemanticInfo: true })
  })

  it('merges manifest options with per-analysis settings and source overrides without leaking into the next analysis', async () => {
    const analyzer = await create({
      autoInstallDependencies: false,
      cjpmToml: {
        package: { version: '0.1.0' },
        dependencies: { existing: '1.0.0' },
      },
    })
    const code = 'package example\n// @package.version: "0.3.0"\n// @dependencies.extra: { git = "https://example.com/extra.git", tag = "v1" }\nmain() {}'
    await analyzer.analyze(code, 'cj', {
      cjpmToml: {
        package: { version: '0.2.0', description: 'retained' },
      },
    })
    expect(createLspSession).toHaveBeenLastCalledWith(sdk, 30_000, expect.objectContaining({
      autoInstallDependencies: false,
      cjpmToml: {
        package: { version: '0.3.0', description: 'retained' },
        dependencies: {
          existing: '1.0.0',
          extra: { git: 'https://example.com/extra.git', tag: 'v1' },
        },
      },
    }))
    await analyzer.analyze('main() {}')
    expect(createLspSession).toHaveBeenLastCalledWith(sdk, 30_000, expect.objectContaining({
      autoInstallDependencies: false,
      cjpmToml: {
        package: { version: '0.1.0' },
        dependencies: { existing: '1.0.0' },
      },
    }))
  })

  it('rejects unsupported extensions and invalid annotations before contacting the LSP', async () => {
    const analyzer = await create()
    await expect(Reflect.apply(analyzer.analyze, analyzer, ['main() {}', 'ts'])).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' })
    await expect(analyzer.analyze('// ---cut-end---')).rejects.toMatchObject({ code: 'INVALID_NOTATION' })
    expect(createLspSession).not.toHaveBeenCalled()
  })

  it('serializes calls while giving every analysis a new session', async () => {
    const firstSession = createSession()
    const secondSession = createSession()
    const started = Promise.withResolvers<void>()
    const released = Promise.withResolvers<Awaited<ReturnType<typeof firstSession.update>>>()
    firstSession.update.mockImplementationOnce(() => {
      started.resolve()
      return released.promise
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession)
    const analyzer = await create()
    const first = analyzer.analyze('let first = 1')
    await started.promise
    const second = analyzer.analyze('let second = 2')
    await Promise.resolve()
    expect(createLspSession).toHaveBeenCalledOnce()
    expect(firstSession.update).toHaveBeenCalledOnce()
    released.resolve({ diagnostics: [], tokens: [], tokenTypes: [] })
    const results = await Promise.all([first, second])
    expect(results.map(result => result.code)).toEqual(['let first = 1', 'let second = 2'])
    expect(createLspSession).toHaveBeenCalledTimes(2)
    expect(firstSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(secondSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('rejects a queued cancellation without creating a session and still disposes the active one', async () => {
    const session = createSession()
    const started = Promise.withResolvers<void>()
    const released = Promise.withResolvers<Awaited<ReturnType<typeof session.update>>>()
    session.update.mockImplementationOnce(() => {
      started.resolve()
      return released.promise
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(session)
    const analyzer = await create()
    const first = analyzer.analyze('main() {}')
    await started.promise
    const controller = new AbortController()
    const reason = new Error('cancel queued analysis')
    const cancelled = analyzer.analyze('main() {}', 'cj', { signal: controller.signal })
    const rejected = expect(cancelled).rejects.toBe(reason)
    controller.abort(reason)
    released.resolve({ diagnostics: [], tokens: [], tokenTypes: [] })
    await Promise.all([first, rejected])
    expect(createLspSession).toHaveBeenCalledOnce()
    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('cancels active analysis, disposes its session, and analyzes again in a new session', async () => {
    const session = createSession()
    const nextSession = createSession()
    const started = Promise.withResolvers<AbortSignal>()
    session.update.mockImplementationOnce((source, signal) => {
      started.resolve(signal)
      return abortOnSignal(source, signal)
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(session).mockResolvedValueOnce(nextSession)
    const analyzer = await create()
    const controller = new AbortController()
    const reason = new Error('cancel active analysis')
    const pending = analyzer.analyze('main() {}', 'cj', { signal: controller.signal })
    const rejected = expect(pending).rejects.toBe(reason)
    const activeSignal = await started.promise
    controller.abort(reason)
    await rejected
    expect(activeSignal.aborted).toBe(true)
    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    await analyzer.analyze('main() {}')
    expect(createLspSession).toHaveBeenCalledTimes(2)
    expect(nextSession.update).toHaveBeenCalledOnce()
    expect(nextSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })

  it('propagates cancellation while creating a session', async () => {
    const initializing = Promise.withResolvers<AbortSignal>()
    vi.mocked(createLspSession).mockImplementationOnce(async (_sdk, _timeout, options = {}) => {
      initializing.resolve(options.signal!)
      await abortOnSignal('', options.signal!)
      return createSession()
    })
    const analyzer = await create()
    const controller = new AbortController()
    const reason = new Error('cancel initialization')
    const pending = analyzer.analyze('main() {}', 'cj', { signal: controller.signal })
    const rejected = expect(pending).rejects.toBe(reason)
    const initializationSignal = await initializing.promise
    controller.abort(reason)
    await rejected
    expect(initializationSignal.aborted).toBe(true)
    await analyzer.analyze('main() {}')
    expect(createLspSession).toHaveBeenCalledTimes(2)
  })

  it('normalizes initialization timeouts while preserving other initialization failures', async () => {
    const timeout = new DOMException('expired', 'TimeoutError')
    vi.mocked(createLspSession).mockRejectedValueOnce(timeout)
    const analyzer = await create()
    await expect(analyzer.analyze('main() {}')).rejects.toMatchObject({ name: 'CjslashError', code: 'LSP_TIMEOUT', cause: timeout })
    const failure = new Error('initialization failed')
    vi.mocked(createLspSession).mockRejectedValueOnce(failure)
    await expect(analyzer.analyze('main() {}')).rejects.toBe(failure)
    expect(analyzer[Symbol.asyncDispose]).toBeTypeOf('function')
  })

  it('normalizes analysis timeouts and permits later analysis', async () => {
    const session = createSession()
    const started = Promise.withResolvers<void>()
    session.update.mockImplementationOnce((source, signal) => {
      started.resolve()
      return abortOnSignal(source, signal)
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(session).mockResolvedValueOnce(createSession())
    const analyzer = await create()
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeout.signal)
    const pending = analyzer.analyze('main() {}')
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LSP_TIMEOUT' })
    await started.promise
    timeout.abort(new DOMException('expired', 'TimeoutError'))
    await rejected
    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    await analyzer.analyze('main() {}')
    expect(createLspSession).toHaveBeenCalledTimes(2)
  })

  it('disposes the session after transport, validation, and callback failures', async () => {
    const transportFailure = new CjslashError('LSP_EXITED', 'transport failure')
    const transportSession = createSession()
    transportSession.update.mockRejectedValueOnce(transportFailure)
    const validationSession = createSession()
    validationSession.update.mockResolvedValueOnce({
      diagnostics: [
        {
          message: 'unexpected',
          code: 731,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
      tokens: [],
      tokenTypes: [],
    })
    const callbackSession = createSession()
    vi.mocked(createLspSession)
      .mockResolvedValueOnce(transportSession)
      .mockResolvedValueOnce(validationSession)
      .mockResolvedValueOnce(callbackSession)
    const analyzer = await create()
    await expect(analyzer.analyze('main() {}')).rejects.toBe(transportFailure)
    await expect(analyzer.analyze('main() {}')).rejects.toMatchObject({ code: 'UNEXPECTED_DIAGNOSTIC' })
    const failure = new Error('user callback failed')
    await expect(analyzer.analyze('main() {}', 'cj', {
      positionHighlights: [
        [0, 1],
      ],
      filterNode() { throw failure },
    })).rejects.toBe(failure)
    expect(transportSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(validationSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(callbackSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  })
})

describe('asynchronous disposal', () => {
  it('shares a cleanup promise and rejects active and queued analysis', async () => {
    const session = createSession()
    const started = Promise.withResolvers<void>()
    session.update.mockImplementationOnce((source, signal) => {
      started.resolve()
      return abortOnSignal(source, signal)
    })
    vi.mocked(createLspSession).mockResolvedValueOnce(session)
    const analyzer = await create()
    const active = analyzer.analyze('main() {}')
    const activeRejected = expect(active).rejects.toMatchObject({ code: 'DISPOSED' })
    await started.promise
    const queued = analyzer.analyze('main() {}')
    const queuedRejected = expect(queued).rejects.toMatchObject({ code: 'DISPOSED' })
    const disposed = analyzer[Symbol.asyncDispose]()
    expect(analyzer[Symbol.asyncDispose]()).toBe(disposed)
    await Promise.all([
      disposed,
      activeRejected,
      queuedRejected,
    ])
    expect(session.update).toHaveBeenCalledOnce()
    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    expect(createLspSession).toHaveBeenCalledOnce()
    await expect(analyzer.analyze('main() {}')).rejects.toMatchObject({ code: 'DISPOSED' })
  })

  it('supports await using and creates a fresh session for each scoped analysis', async () => {
    const firstSession = createSession()
    const secondSession = createSession()
    vi.mocked(createLspSession).mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession)
    let scoped: Cjslash
    {
      await using analyzer = await create()
      scoped = analyzer
      await analyzer.analyze('main() {}')
      await analyzer.analyze('main() {}')
      expect(firstSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
      expect(secondSession[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    }
    await expect(scoped.analyze('main() {}')).rejects.toMatchObject({ code: 'DISPOSED' })
  })
})
