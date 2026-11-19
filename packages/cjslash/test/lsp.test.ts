import type { CompletionItem, CompletionList, Diagnostic, Hover, InitializeParams, ServerCapabilities } from 'vscode-languageserver-protocol'
import type { CancellationToken, PublishDiagnosticsParams } from 'vscode-languageserver-protocol/node'
import type { CjpmToml } from '../src/types'
import events from 'node:events'
import fs from 'node:fs'
import stream from 'node:stream'
import path from 'pathe'
import { URI } from 'vscode-uri'
import { createLspSession } from '../src/lsp'
import { parseSource } from '../src/source'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  createProtocolConnection: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { spawn: mocks.spawn },
}))
vi.mock('tinyexec', () => ({
  exec: vi.fn(),
}))
vi.mock('vscode-languageserver-protocol/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vscode-languageserver-protocol/node')>()
  return { ...actual, createProtocolConnection: mocks.createProtocolConnection }
})

const sdk = {
  root: '/sdk',
  env: { CANGJIE_HOME: '/sdk' },
  version: '1.2.1',
  serverPath: '/sdk/tools/bin/LSPServer',
}
const sessions: Awaited<ReturnType<typeof createLspSession>>[] = []
const stopTransports: (() => void)[] = []

function createTransport() {
  const state = {
    rootUri: '',
    uri: '',
    diagnostics: [] as Diagnostic[],
    tokens: [0, 4, 6, 0, 0] as number[] | null,
    hover: null as Hover | null,
    completions: null as CompletionItem[] | CompletionList | null,
    exitOnNotification: true,
    exitOnTerminate: true,
    capabilities: {
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ['variable'],
          tokenModifiers: [],
        },
        full: true,
      },
      documentLinkProvider: {},
      completionProvider: {
        triggerCharacters: ['.'],
      },
      positionEncoding: 'utf-16',
    } as ServerCapabilities,
  }
  const notifications = new Map<string, (params: PublishDiagnosticsParams) => void>()
  const requests = new Map<string, (params: { items: unknown[] }) => unknown>()
  const child = Object.assign(new events.EventEmitter(), {
    stdin: new stream.PassThrough(),
    stdout: new stream.PassThrough(),
    stderr: new stream.PassThrough(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn<(signal?: NodeJS.Signals) => boolean>(),
  })
  child.kill.mockImplementation((signal = 'SIGTERM') => {
    if (signal === 'SIGKILL' || state.exitOnTerminate) {
      child.signalCode = signal
      child.emit('close', null, signal)
    }
    return true
  })
  const connection = {
    listen: vi.fn(),
    dispose: vi.fn(),
    onRequest: vi.fn((method: string, listener: (params: { items: unknown[] }) => unknown) => {
      requests.set(method, listener)
    }),
    onNotification: vi.fn((type: string | { method: string }, listener: (params: PublishDiagnosticsParams) => void) => {
      notifications.set(typeof type === 'string'
        ? type
        : type.method, listener)
    }),
    sendNotification: vi.fn(async (type: { method: string }, params?: unknown) => {
      if (type.method === 'textDocument/didOpen') state.uri = (params as { textDocument: { uri: string } }).textDocument.uri
      if (type.method === 'exit' && state.exitOnNotification) {
        child.exitCode = 0
        child.emit('close', 0, null)
      }
    }),
    sendRequest: vi.fn(async (type: { method: string }, params?: unknown, _token?: CancellationToken): Promise<unknown> => {
      switch (type.method) {
        case 'initialize':
          state.rootUri = (params as InitializeParams).rootUri!
          return { capabilities: state.capabilities }
        case 'textDocument/semanticTokens/full':
          return state.tokens === null
            ? null
            : { data: state.tokens }
        case 'textDocument/documentLink':
          queueMicrotask(() => notifications.get('textDocument/publishDiagnostics')?.({ uri: (params as { textDocument: { uri: string } }).textDocument.uri, diagnostics: state.diagnostics }))
          return []
        case 'textDocument/hover':
          return state.hover
        case 'textDocument/completion':
          return state.completions
        default:
          return null
      }
    }),
  }
  mocks.spawn.mockReturnValue(child)
  mocks.createProtocolConnection.mockReturnValue(connection)
  const transport = {
    state,
    child,
    connection,
    notifications,
    requests,
  }
  stopTransports.push(() => {
    state.exitOnNotification = true
    state.exitOnTerminate = true
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })
  return transport
}

/**
 * Create and track a session with an optional project configuration and source.
 *
 * ---
 *
 * 使用可选的工程配置和源码创建会话，并跟踪会话以便清理。
 */
async function create(cjpmToml?: CjpmToml, code = ''): Promise<Awaited<ReturnType<typeof createLspSession>>> {
  const session = await createLspSession(sdk, 1000, {
    cjpmToml,
    autoInstallDependencies: false,
    files: parseSource(code, {}).files,
  })
  sessions.push(session)
  return session
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(async () => {
  for (const stopTransport of stopTransports.splice(0))
    stopTransport()
  await Promise.all(sessions.splice(0).map(session => session[Symbol.asyncDispose]()))
  vi.useRealTimers()
})

describe('lsp initialization', () => {
  it('creates an isolated realpath workspace and advertises the capabilities required for diagnostics', async () => {
    const mkdtempSync = fs.mkdtempSync
    vi.spyOn(fs, 'mkdtempSync').mockImplementationOnce(prefix => mkdtempSync(`${prefix}仓颉 #%-`))
    const transport = createTransport()
    const session = await create()
    const directory = URI.parse(transport.state.rootUri).fsPath
    expect(fs.realpathSync(directory)).toBe(directory)
    expect(transport.state.rootUri).toContain('%23%25-')
    expect(fs.readFileSync(path.join(directory, 'cjpm.toml'), 'utf8')).toContain('cjc-version = "1.2.1"')
    expect(fs.readFileSync(path.join(directory, 'cjpm.toml'), 'utf8')).toContain('src-dir = "src"')
    expect(fs.readFileSync(path.join(directory, 'cjpm.toml'), 'utf8')).toContain('name = "default"')
    expect(fs.readFileSync(URI.parse(transport.state.uri).fsPath, 'utf8')).toBe('\n')
    expect(URI.parse(transport.state.uri).fsPath).toBe(path.join(directory, 'src/index.cj'))
    expect(mocks.spawn).toHaveBeenCalledWith(sdk.serverPath, [
      'src',
      '--log-path',
      path.join(directory, 'logs'),
      '--cache-path',
      path.join(directory, 'cache'),
    ], { cwd: directory, env: sdk.env, stdio: 'pipe' })
    const initialize = transport.connection.sendRequest.mock.calls[0][1] as InitializeParams
    expect(initialize.capabilities).toMatchObject({
      general: {
        positionEncodings: ['utf-16'],
      },
      textDocument: {
        documentLink: { dynamicRegistration: false },
        publishDiagnostics: { versionSupport: false },
      },
    })
    expect(initialize.initializationOptions).toMatchObject({
      multiModuleOption: {
        [transport.state.rootUri]: {
          name: 'default',
          src_path: URI.file(path.join(directory, 'src')).toString(),
          requires: {},
          package_requires: {
            package_option: {},
            path_option: [],
          },
        },
      },
    })
    expect(transport.connection.listen).toHaveBeenCalledOnce()
    expect(transport.requests.get('window/workDoneProgress/create')!({ items: [] })).toBeNull()
    expect(transport.requests.get('client/registerCapability')!({ items: [] })).toBeNull()
    expect(transport.requests.get('workspace/configuration')!({
      items: [1, 2],
    })).toEqual([null, null])
    await session[Symbol.asyncDispose]()
    expect(fs.existsSync(directory)).toBe(false)
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
  })

  it.each(['hoverProvider', 'semanticTokensProvider', 'documentLinkProvider'] as const)('rejects missing %s and cleans up the workspace', async (capability) => {
    const transport = createTransport()
    delete transport.state.capabilities[capability]
    await expect(create()).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' })
    expect(fs.existsSync(URI.parse(transport.state.rootUri).fsPath)).toBe(false)
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
  })

  it('isolates sessions under a relative workspaceRoot and preserves the parent and other files during disposal', async () => {
    await using subscriptions = new AsyncDisposableStack()
    const parentDirectory = fs.mkdtempSync(path.resolve('.cjslash-test-'))
    subscriptions.defer((): void => fs.rmSync(parentDirectory, { recursive: true, force: true }))
    const workspaceRoot = path.relative(path.resolve('.'), path.join(parentDirectory, 'nested/工程 #%'))
    const files = parseSource('package example.models\nmain() {}', {}).files
    const firstTransport = createTransport()
    const first = await createLspSession(sdk, 1000, { workspaceRoot, files })
    sessions.push(first)
    const firstDirectory = URI.parse(firstTransport.state.rootUri).fsPath
    expect(path.dirname(path.dirname(firstDirectory))).toBe(fs.realpathSync(workspaceRoot))
    expect(fs.readFileSync(path.join(firstDirectory, 'src/models/index.cj'), 'utf8')).toContain('package example.models')
    const preservedFile = path.join(workspaceRoot, 'keep.txt')
    fs.writeFileSync(preservedFile, 'keep')

    const secondTransport = createTransport()
    const second = await createLspSession(sdk, 1000, { workspaceRoot, files })
    sessions.push(second)
    const secondDirectory = URI.parse(secondTransport.state.rootUri).fsPath
    expect(path.dirname(path.dirname(secondDirectory))).toBe(fs.realpathSync(workspaceRoot))
    expect(secondDirectory).not.toBe(firstDirectory)

    await first[Symbol.asyncDispose]()
    expect(fs.existsSync(path.dirname(firstDirectory))).toBe(false)
    expect(fs.existsSync(secondDirectory)).toBe(true)
    expect(fs.readFileSync(preservedFile, 'utf8')).toBe('keep')

    await second[Symbol.asyncDispose]()
    expect(fs.readdirSync(workspaceRoot)).toEqual(['keep.txt'])
  })

  it('cleans up a failed initialization under workspaceRoot while preserving existing files', async () => {
    await using subscriptions = new AsyncDisposableStack()
    const workspaceRoot = fs.mkdtempSync(path.resolve('.cjslash-test-'))
    subscriptions.defer((): void => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
    const preservedFile = path.join(workspaceRoot, 'keep.txt')
    fs.writeFileSync(preservedFile, 'keep')
    const transport = createTransport()
    delete transport.state.capabilities.hoverProvider

    await expect(createLspSession(sdk, 1000, { workspaceRoot })).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' })
    expect(fs.existsSync(URI.parse(transport.state.rootUri).fsPath)).toBe(false)
    expect(fs.readdirSync(workspaceRoot)).toEqual(['keep.txt'])
    expect(fs.readFileSync(preservedFile, 'utf8')).toBe('keep')
  })

  it('merges cjpmToml overrides into the generated manifest', async () => {
    const transport = createTransport()
    await create({
      package: { name: 'custom' },
      dependencies: { stdx: '1.0.0' },
    }, 'package example\nmain() {}')
    const manifest = fs.readFileSync(path.join(URI.parse(transport.state.rootUri).fsPath, 'cjpm.toml'), 'utf8')
    expect(manifest).toContain('cjc-version = "1.2.1"')
    expect(manifest).toContain('name = "example"')
    expect(manifest).not.toContain('name = "custom"')
    expect(manifest).toContain('[dependencies]')
    expect(manifest).toContain('stdx = "1.0.0"')
  })

  it('creates the declared package path and uses its root as the module name', async () => {
    const transport = createTransport()
    await create(undefined, 'package example.models.user\nmain() {}')
    const directory = URI.parse(transport.state.rootUri).fsPath
    expect(URI.parse(transport.state.uri).fsPath).toBe(path.join(directory, 'src/models/user/index.cj'))
    expect(fs.readFileSync(URI.parse(transport.state.uri).fsPath, 'utf8')).toBe('package example.models.user\nmain() {}\n')
    expect(fs.readFileSync(path.join(directory, 'cjpm.toml'), 'utf8')).toContain('name = "example"')
  })

  it('uses an overridden source directory in source files, server arguments, and initialization', async () => {
    const transport = createTransport()
    await create({
      package: { 'src-dir': 'examples/code', 'compile-option': '-O2' },
    }, 'package example.models\nmain() {}')
    const directory = URI.parse(transport.state.rootUri).fsPath
    expect(URI.parse(transport.state.uri).fsPath).toBe(path.join(directory, 'examples/code/models/index.cj'))
    expect(mocks.spawn.mock.calls[0][1][0]).toBe('examples/code')
    expect((transport.connection.sendRequest.mock.calls[0][1] as InitializeParams).initializationOptions).toMatchObject({
      multiModuleOption: {
        [transport.state.rootUri]: {
          src_path: URI.file(path.join(directory, 'examples/code')).toString(),
          command_option: '-O2',
        },
      },
    })
  })

  it.each([
    '../outside',
    '/outside',
    'C:\\outside',
    '',
  ])('rejects a source directory outside the generated project: %s', async (sourceDirectory) => {
    createTransport()
    const mkdtempSync = vi.spyOn(fs, 'mkdtempSync')
    await expect(create({
      package: { 'src-dir': sourceDirectory },
    })).rejects.toMatchObject({ code: 'INVALID_CJPM_TOML' })
    expect(mkdtempSync).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('rejects invalid cjpmToml before creating a workspace', async () => {
    createTransport()
    const mkdtempSync = vi.spyOn(fs, 'mkdtempSync')
    await expect(createLspSession(sdk, 1000, {
      cjpmToml: { package: [] } as never,
    })).rejects.toMatchObject({ code: 'INVALID_CJPM_TOML' })
    expect(mkdtempSync).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('rejects incompatible position encodings', async () => {
    const transport = createTransport()
    transport.state.capabilities.positionEncoding = 'utf-8'
    await expect(create()).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' })
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
  })

  it('accepts servers that use the default UTF-16 encoding without advertising it', async () => {
    const transport = createTransport()
    delete transport.state.capabilities.positionEncoding
    await expect(create()).resolves.toHaveProperty('update')
  })

  it('does not allocate a workspace for an already-aborted initialization', async () => {
    createTransport()
    const controller = new AbortController()
    const reason = new Error('cancel initialization')
    controller.abort(reason)
    const mkdtempSync = vi.spyOn(fs, 'mkdtempSync')
    await expect(createLspSession(sdk, 1000, { signal: controller.signal })).rejects.toBe(reason)
    expect(mkdtempSync).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('removes partially created workspaces when directory creation fails', async () => {
    createTransport()
    const mkdtempSync = vi.spyOn(fs, 'mkdtempSync')
    const reason = new Error('cannot create source directory')
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw reason
    })
    await expect(create()).rejects.toBe(reason)
    const directory = mkdtempSync.mock.results[0].value
    expect(fs.existsSync(directory)).toBe(false)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('removes the temporary directory when resolving its real path fails', async () => {
    createTransport()
    const mkdtempSync = vi.spyOn(fs, 'mkdtempSync')
    const reason = new Error('cannot resolve workspace path')
    vi.spyOn(fs, 'realpathSync').mockImplementationOnce(() => {
      throw reason
    })
    await expect(create()).rejects.toBe(reason)
    const directory = mkdtempSync.mock.results[0].value
    expect(fs.existsSync(directory)).toBe(false)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('stops the child and removes the workspace when creating the protocol connection fails', async () => {
    const transport = createTransport()
    const reason = new Error('cannot create protocol connection')
    mocks.createProtocolConnection.mockImplementationOnce(() => {
      throw reason
    })
    await expect(create()).rejects.toBe(reason)
    expect(transport.child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(transport.connection.dispose).not.toHaveBeenCalled()
    expect(fs.existsSync(mocks.spawn.mock.calls[0][2].cwd)).toBe(false)
  })

  it('preserves spawn errors and removes temporary files', async () => {
    const transport = createTransport()
    const reason = new Error('spawn ENOENT')
    transport.connection.sendRequest.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        transport.child.emit('error', reason)
        transport.child.emit('close', -1, null)
      })
      return await new Promise(() => {})
    })
    await expect(create()).rejects.toMatchObject({ code: 'LSP_START_FAILED', cause: reason })
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
    expect(fs.existsSync(mocks.spawn.mock.calls[0][2].cwd)).toBe(false)
  })
})

describe('lsp requests and diagnostic synchronization', () => {
  it('creates all source files before initialization and routes requests and diagnostics by URI', async () => {
    const transport = createTransport()
    const source = '// @filename: data.cj\npackage example.models\npublic let answer = 42\n// @filename: main.cj\npackage example\nmain() {}'
    const session = await create(undefined, source)
    const directory = URI.parse(transport.state.rootUri).fsPath
    const dataUri = URI.file(path.join(directory, 'src/models/data.cj')).toString()
    const mainUri = URI.file(path.join(directory, 'src/main.cj')).toString()
    expect(fs.readFileSync(URI.parse(dataUri).fsPath, 'utf8')).toContain('public let answer = 42')
    expect(fs.readFileSync(URI.parse(mainUri).fsPath, 'utf8')).toContain('package example')
    const opened = transport.connection.sendNotification.mock.calls.filter(([type]) => type.method === 'textDocument/didOpen')
    expect(opened.map(([, params]) => (params as { textDocument: { uri: string } }).textDocument.uri)).toEqual([dataUri, mainUri])
    await session.update('package example.models\npublic let answer = 0', new AbortController().signal, 'data.cj')
    await session.update('package example\nmain() {}', new AbortController().signal, 'main.cj')
    await session.hover({ line: 1, character: 11 }, new AbortController().signal, 'data.cj')
    transport.state.completions = [
      { label: 'answer' },
    ]
    expect(await session.complete({ line: 1, character: 0 }, new AbortController().signal, 'main.cj')).toBe(transport.state.completions)
    expect(transport.connection.sendRequest.mock.calls.at(-1)![1]).toEqual({
      textDocument: { uri: mainUri },
      position: { line: 1, character: 0 },
      context: { triggerKind: 1 },
    })
    const changes = transport.connection.sendNotification.mock.calls.filter(([type]) => type.method === 'textDocument/didChange')
    expect(changes.map(([, params]) => (params as { textDocument: { uri: string, version: number } }).textDocument)).toEqual([
      { uri: dataUri, version: 2 },
      { uri: mainUri, version: 2 },
    ])
    await expect(session.update('', new AbortController().signal, 'unknown.cj')).rejects.toMatchObject({ code: 'INVALID_QUERY' })
  })

  it('advertises completion support while accepting SDKs without a completion provider', async () => {
    const transport = createTransport()
    delete transport.state.capabilities.completionProvider
    const session = await create()
    const initialize = transport.connection.sendRequest.mock.calls[0][1] as InitializeParams
    expect(initialize.capabilities.textDocument?.completion).toMatchObject({
      contextSupport: true,
      completionItem: { snippetSupport: false },
    })
    await expect(session.update('main() {}', new AbortController().signal)).resolves.toHaveProperty('diagnostics')
    expect(() => session.complete({ line: 0, character: 0 }, new AbortController().signal)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FEATURE' }))
    expect(transport.connection.sendRequest.mock.calls.some(([type]) => type.method === 'textDocument/completion')).toBe(false)
  })

  it('uses advertised trigger characters from the updated text document', async () => {
    const transport = createTransport()
    const session = await create()
    const signal = new AbortController().signal
    await session.update('main() { message. }', signal)
    await session.complete({ line: 0, character: 17 }, signal)
    expect(transport.connection.sendRequest.mock.calls.at(-1)![1]).toMatchObject({
      context: { triggerKind: 2, triggerCharacter: '.' },
    })
    delete transport.state.capabilities.completionProvider!.triggerCharacters
    await session.complete({ line: 0, character: 17 }, signal)
    expect(transport.connection.sendRequest.mock.calls.at(-1)![1]).toMatchObject({
      context: { triggerKind: 1 },
    })
  })

  it('cancels a pending completion request', async () => {
    const transport = createTransport()
    const session = await create()
    const implementation = transport.connection.sendRequest.getMockImplementation()!
    transport.connection.sendRequest.mockImplementation((type, params, token) => type.method === 'textDocument/completion'
      ? new Promise(() => {})
      : implementation(type, params, token))
    const abortController = new AbortController()
    const pending = session.complete({ line: 0, character: 5 }, abortController.signal)
    const token = transport.connection.sendRequest.mock.calls.at(-1)![2]!
    const reason = new Error('cancel completions')
    const rejected = expect(pending).rejects.toBe(reason)
    abortController.abort(reason)
    await rejected
    expect(token.isCancellationRequested).toBe(true)
  })

  it('updates files and document versions before retrieving semantic tokens and refreshed diagnostics', async () => {
    const transport = createTransport()
    const session = await create()
    const diagnostic: Diagnostic = {
      message: 'new diagnostic',
      code: 731,
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 10 },
      },
    }
    transport.state.diagnostics = [diagnostic]
    const first = await session.update('let answer = 42', new AbortController().signal)
    expect(first).toEqual({
      diagnostics: [diagnostic],
      tokens: [0, 4, 6, 0, 0],
      tokenTypes: ['variable'],
    })
    expect(fs.readFileSync(URI.parse(transport.state.uri).fsPath, 'utf8')).toBe('let answer = 42\n')
    await session.update('main() {}', new AbortController().signal)
    const changes = transport.connection.sendNotification.mock.calls.filter(([type]) => type.method === 'textDocument/didChange')
    expect(changes.map(([, params]) => (params as { textDocument: { version: number } }).textDocument.version)).toEqual([2, 3])
    expect(transport.connection.sendRequest.mock.calls.map(([type]) => type.method)).toEqual([
      'initialize',
      'textDocument/semanticTokens/full',
      'textDocument/documentLink',
      'textDocument/semanticTokens/full',
      'textDocument/documentLink',
    ])
  })

  it('waits for the diagnostic refresh barrier and ignores stale or unrelated notifications', async () => {
    const transport = createTransport()
    const session = await create()
    const requested = Promise.withResolvers<void>()
    const implementation = transport.connection.sendRequest.getMockImplementation()!
    transport.connection.sendRequest.mockImplementation(async (type, params, token) => {
      if (type.method === 'textDocument/semanticTokens/full') {
        transport.notifications.get('textDocument/publishDiagnostics')!({
          uri: transport.state.uri,
          diagnostics: [
            {
              message: 'stale',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ],
        })
      }
      if (type.method === 'textDocument/documentLink') {
        transport.notifications.get('textDocument/publishDiagnostics')!({ uri: 'file:///other.cj', diagnostics: [] })
        requested.resolve()
        return []
      }
      return implementation(type, params, token)
    })
    let settled = false
    const pending = session.update('main() {}', new AbortController().signal).then((result) => {
      settled = true
      return result
    })
    await requested.promise
    await Promise.resolve()
    expect(settled).toBe(false)
    transport.notifications.get('textDocument/publishDiagnostics')!({ uri: transport.state.uri, version: 999, diagnostics: [] })
    expect((await pending).diagnostics).toEqual([])
  })

  it('handles absent semantic tokens and returns independent diagnostic arrays', async () => {
    const transport = createTransport()
    transport.state.tokens = null
    const session = await create()
    const result = await session.update('main() {}', new AbortController().signal)
    expect(result.tokens).toEqual([])
    expect(result.diagnostics).not.toBe(transport.state.diagnostics)
  })

  it('forwards hover positions and cancels pending JSON-RPC requests', async () => {
    const transport = createTransport()
    const session = await create()
    const implementation = transport.connection.sendRequest.getMockImplementation()!
    transport.connection.sendRequest.mockImplementation((type, params, token) => type.method === 'textDocument/hover'
      ? new Promise(() => {})
      : implementation(type, params, token))
    const controller = new AbortController()
    const reason = new Error('cancel hover')
    const pending = session.hover({ line: 1, character: 4 }, controller.signal)
    const rejected = expect(pending).rejects.toBe(reason)
    const request = transport.connection.sendRequest.mock.calls.at(-1)!
    expect(request[0].method).toBe('textDocument/hover')
    expect(request[1]).toEqual({
      textDocument: { uri: transport.state.uri },
      position: { line: 1, character: 4 },
    })
    controller.abort(reason)
    await rejected
    expect(request[2]!.isCancellationRequested).toBe(true)
  })

  it('returns hover responses without changing the SDK payload', async () => {
    const transport = createTransport()
    const session = await create()
    transport.state.hover = {
      contents: { kind: 'markdown', value: '```cangjie\nInt64\n```' },
    }
    expect(await session.hover({ line: 0, character: 4 }, new AbortController().signal)).toBe(transport.state.hover)
  })

  it('cancels a pending diagnostic notification and leaves the next update usable', async () => {
    const transport = createTransport()
    const session = await create()
    const requested = Promise.withResolvers<void>()
    const implementation = transport.connection.sendRequest.getMockImplementation()!
    transport.connection.sendRequest.mockImplementation(async (type, params, token) => {
      if (type.method === 'textDocument/documentLink') {
        requested.resolve()
        return []
      }
      return implementation(type, params, token)
    })
    const controller = new AbortController()
    const reason = new Error('cancel diagnostics')
    const pending = session.update('main() {}', controller.signal)
    const rejected = expect(pending).rejects.toBe(reason)
    await requested.promise
    controller.abort(reason)
    await rejected
    transport.notifications.get('textDocument/publishDiagnostics')!({ uri: transport.state.uri, diagnostics: [] })
    transport.connection.sendRequest.mockImplementation(implementation)
    expect((await session.update('main() {}', new AbortController().signal)).diagnostics).toEqual([])
  })

  it('rejects requests after an unexpected server exit and includes bounded stderr output', async () => {
    const transport = createTransport()
    const session = await create()
    transport.child.stderr.write(`${'x'.repeat(20_000)}last server error`)
    transport.child.exitCode = 1
    transport.child.emit('close', 1, null)
    const error = await session.hover({ line: 0, character: 4 }, new AbortController().signal).catch(error => error)
    expect(error).toMatchObject({ code: 'LSP_EXITED' })
    expect(error.message).toContain('last server error')
    expect(error.message.length).toBeLessThan(17_000)
    await expect(session.update('main() {}', new AbortController().signal)).rejects.toMatchObject({ code: 'LSP_EXITED' })
  })
})

describe('lsp cleanup', () => {
  it('shares an idempotent shutdown promise and sends shutdown before exit', async () => {
    const transport = createTransport()
    const session = await create()
    const disposed = session[Symbol.asyncDispose]()
    expect(session[Symbol.asyncDispose]()).toBe(disposed)
    await disposed
    expect(transport.connection.sendRequest.mock.calls.at(-1)![0].method).toBe('shutdown')
    expect(transport.connection.sendNotification.mock.calls.at(-1)![0].method).toBe('exit')
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
    expect(transport.child.kill).not.toHaveBeenCalled()
  })

  it('escalates from SIGTERM to SIGKILL when graceful exit is ignored', async () => {
    const transport = createTransport()
    const session = await create()
    transport.state.exitOnNotification = false
    transport.state.exitOnTerminate = false
    vi.useFakeTimers()
    const disposed = session[Symbol.asyncDispose]()
    await vi.advanceTimersByTimeAsync(1000)
    expect(transport.child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(1000)
    await disposed
    expect(transport.child.kill.mock.calls).toEqual([
      ['SIGTERM'],
      ['SIGKILL'],
    ])
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
    expect(fs.existsSync(URI.parse(transport.state.rootUri).fsPath)).toBe(false)
  })

  it('removes temporary files even when the shutdown request fails', async () => {
    const transport = createTransport()
    const session = await create()
    const implementation = transport.connection.sendRequest.getMockImplementation()!
    transport.connection.sendRequest.mockImplementation(async (type, params, token) => {
      if (type.method === 'shutdown') throw new Error('connection closed')
      return implementation(type, params, token)
    })
    vi.useFakeTimers()
    const disposed = session[Symbol.asyncDispose]()
    await vi.advanceTimersByTimeAsync(1000)
    await disposed
    expect(transport.child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
    expect(fs.existsSync(URI.parse(transport.state.rootUri).fsPath)).toBe(false)
  })

  it('removes the workspace when disposing the protocol connection fails', async () => {
    const transport = createTransport()
    const session = await createLspSession(sdk, 1000)
    const reason = new Error('cannot dispose protocol connection')
    transport.connection.dispose.mockImplementationOnce(() => {
      throw reason
    })
    const disposed = session[Symbol.asyncDispose]()
    expect(session[Symbol.asyncDispose]()).toBe(disposed)
    await expect(disposed).rejects.toBe(reason)
    expect(transport.child.exitCode).toBe(0)
    expect(transport.connection.dispose).toHaveBeenCalledOnce()
    expect(fs.existsSync(URI.parse(transport.state.rootUri).fsPath)).toBe(false)
  })
})
