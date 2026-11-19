import type { CompletionItem, CompletionList, Diagnostic, Hover, Position, SemanticTokens } from 'vscode-languageserver-protocol'
import type { CangjieSdk } from './sdk'
import type { CangjieSourceFile } from './source'
import type { CjpmToml } from './types'
import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { parseTOML } from 'confbox/toml'
import path from 'pathe'
import { CancellationTokenSource, CompletionRequest, CompletionTriggerKind, createProtocolConnection, DidChangeTextDocumentNotification, DidOpenTextDocumentNotification, DocumentLinkRequest, ExitNotification, HoverRequest, InitializedNotification, InitializeRequest, PublishDiagnosticsNotification, SemanticTokensRequest, ShutdownRequest } from 'vscode-languageserver-protocol/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { resolveCjpmToml } from './cjpm'
import { resolveCjpmModules } from './dependencies'
import { CjslashError } from './error'
import { parseSource } from './source'

/**
 * Configuration for one isolated Cangjie LSP session.
 *
 * ---
 *
 * 单个隔离仓颉 LSP 会话的配置。
 */
export interface CreateLspSessionOptions {
  /**
   * Cancels initialization and all in-flight analysis requests.
   *
   * ---
   *
   * 取消初始化以及所有进行中的分析请求。
   */
  readonly signal?: AbortSignal

  /**
   * Additional serializable JavaScript configuration merged into the generated project manifest.
   *
   * The package name follows the source; the source directory is configurable.
   *
   * ---
   *
   * 合并到生成的工程清单中的额外可序列化 JavaScript 配置。
   *
   * 包名跟随源码，源码目录可以配置。
   */
  readonly cjpmToml?: CjpmToml

  /**
   * Download uncached dependencies before initialization; defaults to `true`.
   *
   * ---
   *
   * 在初始化前下载未缓存的依赖，默认为 `true`。
   */
  readonly autoInstallDependencies?: boolean

  /**
   * Parent directory for the session's isolated project; defaults to the system temporary directory.
   *
   * The parent is created when missing and retained after session disposal.
   *
   * ---
   *
   * 会话隔离工程的父目录，默认为系统临时目录。
   *
   * 不存在的父目录会自动创建，并在会话释放后保留。
   */
  readonly workspaceRoot?: string

  /**
   * Source files used to create the project module before starting the LSP.
   *
   * ---
   *
   * 启动 LSP 前用于创建工程模块的源文件。
   */
  readonly files?: readonly CangjieSourceFile[]
}

/**
 * Diagnostics and semantic tokens produced by one LSP update.
 *
 * ---
 *
 * 单次 LSP 更新产生的诊断和语义标记。
 */
export interface LspUpdateResult {
  /**
   * Diagnostics reported for the analyzed source.
   *
   * ---
   *
   * 针对分析源码报告的诊断。
   */
  readonly diagnostics: Diagnostic[]

  /**
   * Relative semantic-token data.
   *
   * ---
   *
   * 相对编码的语义标记数据。
   */
  readonly tokens: number[]

  /**
   * Semantic token types referenced by the token data.
   *
   * ---
   *
   * 标记数据引用的语义标记类型。
   */
  readonly tokenTypes: string[]
}

/**
 * An initialized Cangjie LSP session bound to a temporary workspace.
 *
 * ---
 *
 * 绑定临时工作区的已初始化仓颉 LSP 会话。
 */
export interface LspSession extends AsyncDisposable {
  /**
   * Update the workspace source and retrieve refreshed diagnostics and semantic tokens.
   *
   * ---
   *
   * 更新工作区源码，并获取刷新后的诊断和语义标记。
   */
  update(code: string, signal: AbortSignal, filename?: string): Promise<LspUpdateResult>

  /**
   * Request hover information at a UTF-16 position.
   *
   * ---
   *
   * 在 UTF-16 位置请求 hover 信息。
   */
  hover(position: Position, signal: AbortSignal, filename?: string): Promise<Hover | null>

  /**
   * Request completions at a file-local UTF-16 cursor position.
   *
   * ---
   *
   * 在文件内部的 UTF-16 光标位置请求补全。
   */
  complete(position: Position, signal: AbortSignal, filename?: string): Promise<CompletionList | CompletionItem[] | null>

  /**
   * Stop the language server and release the temporary workspace.
   *
   * ---
   *
   * 停止语言服务器并释放临时工作区。
   */
  [Symbol.asyncDispose](): Promise<void>
}

/**
 * Create an isolated Cangjie LSP session for one analysis.
 *
 * ---
 *
 * 为一次分析创建独立的仓颉 LSP 会话。
 */
export async function createLspSession(sdk: CangjieSdk, timeout: number, options: CreateLspSessionOptions = {}): Promise<LspSession> {
  const signal = options.signal ?? AbortSignal.timeout(timeout)
  signal.throwIfAborted()
  const files = options.files ?? parseSource('', {}).files
  if (!files.length) throw new CjslashError('INVALID_NOTATION', 'An LSP session requires at least one source file.')
  const packageInfo = files[0].packageInfo
  const projectToml = resolveCjpmToml(sdk.version, options.cjpmToml, packageInfo.moduleName)
  const manifest = parseTOML<CjpmToml>(projectToml)
  const sourceDirectory = manifest.package?.['src-dir']
  if (typeof sourceDirectory !== 'string' || !sourceDirectory.trim() || path.isAbsolute(sourceDirectory) || /^[a-z]:/i.test(sourceDirectory) || sourceDirectory.split(/[\\/]/).includes('..')) throw new CjslashError('INVALID_CJPM_TOML', 'package.src-dir must be a relative directory inside the generated project.')
  await using subscriptions = new AsyncDisposableStack()
  const workspaceRoot = path.resolve(options.workspaceRoot ?? os.tmpdir())
  if (options.workspaceRoot !== undefined) fs.mkdirSync(workspaceRoot, { recursive: true })
  const temporaryDirectory = fs.mkdtempSync(path.join(workspaceRoot, 'cjslash-'))
  subscriptions.defer(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(temporaryDirectory, packageInfo.moduleName)
  fs.mkdirSync(projectDirectory)
  const directory = fs.realpathSync(projectDirectory)
  const documents = new Map(files.map((file) => {
    const sourcePath = path.join(directory, sourceDirectory, path.relative('src', file.packageInfo.sourcePath))
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    const text = `${file.content}\n`
    fs.writeFileSync(sourcePath, text)
    return [
      file.filename,
      {
        sourcePath,
        textDocument: TextDocument.create(URI.file(sourcePath).toString(), 'cangjie', 1, text),
      },
    ] as const
  }))
  for (const directoryName of ['logs', 'cache'])
    fs.mkdirSync(path.join(directory, directoryName))
  fs.writeFileSync(path.join(directory, 'cjpm.toml'), projectToml)
  const multiModuleOption = await resolveCjpmModules(sdk, manifest, directory, workspaceRoot, options.autoInstallDependencies ?? true, signal)
  signal.throwIfAborted()

  const child = childProcess.spawn(sdk.serverPath, [
    sourceDirectory,
    '--log-path',
    path.join(directory, 'logs'),
    '--cache-path',
    path.join(directory, 'cache'),
  ], { cwd: directory, env: sdk.env, stdio: 'pipe' })
  const abortController = new AbortController()
  let stopping = false
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-16_384)
  })
  child.on('error', (cause) => {
    abortController.abort(new CjslashError('LSP_START_FAILED', `Cannot start ${sdk.serverPath}.`, { cause }))
  })
  const exited = new Promise<void>((resolve) => {
    child.once('close', (code, signal) => {
      if (!stopping) abortController.abort(new CjslashError('LSP_EXITED', `Cangjie LSP exited (${signal || code}). ${stderr}`.trim()))
      resolve()
    })
  })
  subscriptions.defer(async () => {
    stopping = true
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
  })
  const connection = createProtocolConnection(child.stdout, child.stdin)
  subscriptions.defer(() => connection.dispose())
  subscriptions.defer(async () => {
    stopping = true
    if (child.exitCode === null && child.signalCode === null && !abortController.signal.aborted) {
      try {
        await abortable(connection.sendRequest(ShutdownRequest.type), AbortSignal.timeout(Math.min(timeout, 2_000)))
        await connection.sendNotification(ExitNotification.type)
      }
      catch {}
    }
    if (!await waitForExit(1_000)) {
      child.kill('SIGTERM')
      if (!await waitForExit(1_000)) {
        child.kill('SIGKILL')
        await exited
      }
    }
  })
  connection.onRequest('window/workDoneProgress/create', () => null)
  connection.onRequest('client/registerCapability', () => null)
  connection.onRequest('workspace/configuration', (params: { items: unknown[] }) => params.items.map(() => null))
  connection.onNotification('$/progress', () => {})
  connection.listen()

  /**
   * Wait for the language server process to exit within a time limit.
   *
   * ---
   *
   * 在时限内等待语言服务器进程退出。
   */
  async function waitForExit(milliseconds: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        exited.then(() => true),
        new Promise<false>((resolve) => { timer = setTimeout(resolve, milliseconds, false) }),
      ])
    }
    finally {
      clearTimeout(timer)
    }
  }

  /**
   * Send an LSP request with cancellation and server-failure propagation.
   *
   * ---
   *
   * 发送带取消和服务器故障传播的 LSP 请求。
   */
  async function request<Result>(operation: (token: CancellationTokenSource['token']) => Promise<Result>, signal: AbortSignal): Promise<Result> {
    const combined = AbortSignal.any([signal, abortController.signal])
    combined.throwIfAborted()
    const cancellation = new CancellationTokenSource()
    const onAbort = (): void => cancellation.cancel()
    combined.addEventListener('abort', onAbort, { once: true })
    try {
      return await abortable(operation(cancellation.token), combined)
    }
    finally {
      combined.removeEventListener('abort', onAbort)
      cancellation.dispose()
    }
  }

  const rootUri = URI.file(directory).toString()
  const initialized = await request(token => connection.sendRequest(InitializeRequest.type, {
    processId: process.pid,
    rootUri,
    workspaceFolders: [
      { uri: rootUri, name: packageInfo.moduleName },
    ],
    capabilities: {
      general: {
        positionEncodings: ['utf-16'],
      },
      textDocument: {
        hover: {
          contentFormat: ['markdown', 'plaintext'],
        },
        completion: {
          contextSupport: true,
          completionItem: {
            snippetSupport: false,
            documentationFormat: ['markdown', 'plaintext'],
          },
        },
        documentLink: { dynamicRegistration: false },
        publishDiagnostics: { versionSupport: false },
        semanticTokens: {
          requests: { full: true },
          tokenTypes: [],
          tokenModifiers: [],
          formats: ['relative'],
        },
      },
    },
    initializationOptions: {
      multiModuleOption,
      conditionCompileOption: {},
      singleConditionCompileOption: {},
      conditionCompilePaths: [],
      targetLib: '',
    },
  }, token), signal)
  const provider = initialized.capabilities.semanticTokensProvider
  if (!initialized.capabilities.hoverProvider || !provider || !initialized.capabilities.documentLinkProvider) throw new CjslashError('UNSUPPORTED_FEATURE', 'This SDK must support hover, semantic tokens, and document links.')
  if (initialized.capabilities.positionEncoding && initialized.capabilities.positionEncoding !== 'utf-16') throw new CjslashError('UNSUPPORTED_FEATURE', 'The Cangjie LSP must use UTF-16 positions.')

  await connection.sendNotification(InitializedNotification.type, {})
  for (const { textDocument } of documents.values()) {
    await connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri: textDocument.uri,
        languageId: textDocument.languageId,
        version: textDocument.version,
        text: textDocument.getText(),
      },
    })
  }

  const diagnosticListeners = new Map<string, (value: Diagnostic[]) => void>()
  connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
    diagnosticListeners.get(params.uri)?.(params.diagnostics)
  })

  /**
   * Resolve the workspace document for one virtual filename.
   *
   * ---
   *
   * 根据虚拟文件名获取对应的工作区文档。
   */
  function getDocument(filename = files[0].filename): { sourcePath: string, textDocument: TextDocument } {
    const document = documents.get(filename)
    if (!document) throw new CjslashError('INVALID_QUERY', `Unknown source file: ${filename}.`)
    return document
  }

  const resources = subscriptions.move()
  let cleanupPromise: Promise<void> | undefined
  return {
    /**
     * Update the workspace source and retrieve refreshed analysis data.
     *
     * ---
     *
     * 更新工作区源码并获取刷新后的分析数据。
     */
    async update(code: string, signal: AbortSignal, filename?: string): Promise<LspUpdateResult> {
      const combined = AbortSignal.any([signal, abortController.signal])
      combined.throwIfAborted()
      const { textDocument, sourcePath } = getDocument(filename)
      const { uri } = textDocument
      try {
        const text = `${code}\n`
        fs.writeFileSync(sourcePath, text)
        TextDocument.update(textDocument, [
          { text },
        ], textDocument.version + 1)
        await connection.sendNotification(DidChangeTextDocumentNotification.type, {
          textDocument: { uri, version: textDocument.version },
          contentChanges: [
            { text },
          ],
        })
        const tokens: SemanticTokens | null = await request(token => connection.sendRequest(SemanticTokensRequest.type, {
          textDocument: { uri },
        }, token), combined)
        const notification = new Promise<Diagnostic[]>((resolve) => {
          diagnosticListeners.set(uri, resolve)
        })
        const [, diagnostics] = await Promise.all([
          request(token => connection.sendRequest(DocumentLinkRequest.type, {
            textDocument: { uri },
          }, token), combined),
          abortable(notification, combined),
        ])
        return {
          diagnostics: [...diagnostics],
          tokens: tokens?.data || [],
          tokenTypes: provider.legend.tokenTypes,
        }
      }
      finally {
        diagnosticListeners.delete(uri)
      }
    },
    /**
     * Request hover information at a UTF-16 position.
     *
     * ---
     *
     * 在 UTF-16 位置请求 hover 信息。
     */
    hover(position: Position, signal: AbortSignal, filename?: string): Promise<Hover | null> {
      return request(token => connection.sendRequest(HoverRequest.type, {
        textDocument: { uri: getDocument(filename).textDocument.uri },
        position,
      }, token), signal)
    },
    /**
     * Request completions only when the server advertises completion support.
     *
     * ---
     *
     * 仅在服务器声明支持补全时发送补全请求。
     */
    complete(position: Position, signal: AbortSignal, filename?: string): Promise<CompletionList | CompletionItem[] | null> {
      if (!initialized.capabilities.completionProvider) throw new CjslashError('UNSUPPORTED_FEATURE', 'This SDK does not support completion queries (^|).')
      const { textDocument } = getDocument(filename)
      const triggerCharacter = textDocument.getText()[textDocument.offsetAt(position) - 1]
      const context = initialized.capabilities.completionProvider.triggerCharacters?.includes(triggerCharacter)
        ? { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter }
        : { triggerKind: CompletionTriggerKind.Invoked }
      return request(token => connection.sendRequest(CompletionRequest.type, {
        textDocument: { uri: textDocument.uri },
        position,
        context,
      }, token), signal)
    },
    /**
     * Stop the language server and remove the temporary workspace.
     *
     * ---
     *
     * 停止语言服务器并删除临时工作区。
     */
    [Symbol.asyncDispose](): Promise<void> {
      cleanupPromise ??= resources.disposeAsync()
      return cleanupPromise
    },
  }
}

/**
 * Reject as soon as an abort signal fires, otherwise resolve with the promise.
 *
 * ---
 *
 * 中止信号触发时立即拒绝，否则返回原 Promise 的结果。
 */
async function abortable<Result>(promise: Promise<Result>, signal: AbortSignal): Promise<Result> {
  signal.throwIfAborted()
  let onAbort: () => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([promise, aborted])
  }
  finally {
    signal.removeEventListener('abort', onAbort)
  }
}
