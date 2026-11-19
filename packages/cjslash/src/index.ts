import type { CjslashResult } from '@cjslash/protocol'
import type { LspSession } from './lsp'
import type { ParsedSource } from './source'
import type { Cjslash, CjslashExecuteOptions, CjslashOptions } from './types'
import path from 'pathe'
import { analyzeSource } from './analyze'
import { mergeCjpmToml } from './cjpm'
import { CjslashError } from './error'
import { createLspSession } from './lsp'
import { resolveSdk } from './sdk'
import { parseSource } from './source'

/**
 * Create a Cangjie analyzer that initializes an isolated LSP session per analysis.
 *
 * - `options`: the instance configuration, including the SDK path.
 * - Returns an analyzer supporting `await using` for asynchronous cleanup.
 * - Initialization failures also stop the process and remove temporary files.
 *
 * ---
 *
 * 创建仓颉分析器，并在每次分析时初始化独立的 LSP 会话。
 *
 * - `options`：包含 SDK 路径的实例配置。
 * - 返回支持通过 `await using` 异步释放资源的分析器。
 * - 初始化失败时同样停止进程并删除临时文件。
 */
export async function createCjslasher(options: CjslashOptions): Promise<Cjslash> {
  const timeout = options.timeout ?? 30_000
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) throw new RangeError('timeout must be a positive integer no greater than 2,147,483,647 milliseconds.')
  const sdk = await resolveSdk(options.sdkPath, timeout, options.platform, options.arch)
  const resolvedOptions = Object.freeze({
    ...options,
    sdkPath: sdk.root,
    autoInstallDependencies: options.autoInstallDependencies ?? true,
    ...(options.workspaceRoot === undefined
      ? {}
      : {
          workspaceRoot: path.resolve(options.workspaceRoot),
        }),
  })
  let queue: Promise<unknown> = Promise.resolve()
  const abortController = new AbortController()
  await using subscriptions = new AsyncDisposableStack()
  subscriptions.defer(async (): Promise<void> => {
    await queue
  })
  subscriptions.defer((): void => abortController.abort(new CjslashError('DISPOSED', 'The Cangjie analyzer has been disposed.')))
  const resources = subscriptions.move()
  let cleanupPromise: Promise<void> | undefined

  /**
   * Initialize a new LSP session and normalize timeout failures.
   *
   * ---
   *
   * 初始化新的 LSP 会话并规范化超时故障。
   */
  async function initialize(parsed: ParsedSource, signal?: AbortSignal): Promise<LspSession> {
    try {
      return await createLspSession(sdk, timeout, {
        signal,
        cjpmToml: parsed.cjpmToml,
        autoInstallDependencies: resolvedOptions.autoInstallDependencies,
        workspaceRoot: resolvedOptions.workspaceRoot,
        files: parsed.files,
      })
    }
    catch (error) {
      throw normalizeError(error)
    }
  }

  /**
   * Convert LSP timeout errors into a stable analyzer error.
   *
   * ---
   *
   * 将 LSP 超时错误转换为稳定的分析器错误。
   */
  function normalizeError(error: unknown): unknown {
    if (error instanceof Error && error.name === 'TimeoutError') return new CjslashError('LSP_TIMEOUT', `Cangjie LSP exceeded the ${timeout} ms time limit.`, { cause: error })
    return error
  }

  return {
    options: resolvedOptions,
    /**
     * Analyze one Cangjie example on the serialized work queue.
     *
     * ---
     *
     * 在串行任务队列中分析一个仓颉示例。
     */
    analyze(code: string, extension: 'cj' = 'cj', executeOptions: CjslashExecuteOptions = {}): Promise<CjslashResult> {
      const run = queue.then(async (): Promise<CjslashResult> => {
        abortController.signal.throwIfAborted()
        executeOptions.signal?.throwIfAborted()
        if (extension !== 'cj') throw new CjslashError('UNSUPPORTED_FEATURE', `Unsupported source extension: ${extension}. Use cj.`)
        const merged = {
          ...resolvedOptions,
          ...executeOptions,
          cjpmToml: mergeCjpmToml(resolvedOptions.cjpmToml, executeOptions.cjpmToml),
          handbookOptions: {
            ...resolvedOptions.handbookOptions,
            ...executeOptions.handbookOptions,
          },
        }
        const parsed = parseSource(code, merged)
        const signal = AbortSignal.any([
          abortController.signal,
          ...(executeOptions.signal
            ? [executeOptions.signal]
            : []),
          AbortSignal.timeout(timeout),
        ])
        let session: LspSession | undefined
        try {
          session = await initialize(parsed, signal)
          signal.throwIfAborted()
          return await analyzeSource(code, parsed, session, merged, signal)
        }
        catch (error) {
          throw normalizeError(error)
        }
        finally {
          await session?.[Symbol.asyncDispose]()
        }
      })
      queue = run.catch((): void => {})
      return run
    },
    /**
     * Dispose the analyzer and share one cleanup promise across calls.
     *
     * ---
     *
     * 释放分析器，并在多次调用间共享同一个清理 Promise。
     */
    [Symbol.asyncDispose](): Promise<void> {
      cleanupPromise ??= resources.disposeAsync()
      return cleanupPromise
    },
  }
}

export { CjslashError } from './error'
export type { CjslashErrorCode } from './error'
export type { CjpmToml, CjpmTomlSection, CjpmTomlValue, Cjslash, CjslashExecuteOptions, CjslashOptions } from './types'
