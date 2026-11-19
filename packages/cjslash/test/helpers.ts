import type { LspSession } from '../src/lsp'

/**
 * Mocked LSP session used by unit tests.
 *
 * ---
 *
 * 单元测试使用的模拟 LSP 会话。
 */
export interface MockedLspSession extends LspSession {
  /**
   * Mocked source update operation.
   *
   * ---
   *
   * 模拟的源码更新操作。
   */
  update: ReturnType<typeof vi.fn<LspSession['update']>>

  /**
   * Mocked hover operation.
   *
   * ---
   *
   * 模拟的 hover 操作。
   */
  hover: ReturnType<typeof vi.fn<LspSession['hover']>>

  /**
   * Mocked completion operation.
   *
   * ---
   *
   * 模拟的补全操作。
   */
  complete: ReturnType<typeof vi.fn<LspSession['complete']>>

  /**
   * Mocked asynchronous disposal operation.
   *
   * ---
   *
   * 模拟的异步释放操作。
   */
  [Symbol.asyncDispose]: ReturnType<typeof vi.fn<LspSession[typeof Symbol.asyncDispose]>>
}

/**
 * Create a mocked LSP session for unit tests.
 *
 * ---
 *
 * 为单元测试创建一个模拟的 LSP 会话。
 */
export function createSession(): MockedLspSession {
  return {
    update: vi.fn<LspSession['update']>().mockResolvedValue({
      diagnostics: [],
      tokens: [],
      tokenTypes: [],
    }),
    hover: vi.fn<LspSession['hover']>().mockResolvedValue(null),
    complete: vi.fn<LspSession['complete']>().mockResolvedValue(null),
    [Symbol.asyncDispose]: vi.fn<LspSession[typeof Symbol.asyncDispose]>().mockResolvedValue(undefined),
  }
}

/**
 * Return a pending LSP update that rejects when the signal is aborted.
 *
 * ---
 *
 * 返回一个在信号中止时拒绝的待处理 LSP 更新。
 */
export function abortOnSignal(_code: string, signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.throwIfAborted()
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}
