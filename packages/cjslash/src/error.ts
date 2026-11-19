import type { NodeError } from '@cjslash/protocol'

/**
 * Machine-readable failures reported by the Cangjie analyzer.
 *
 * ---
 *
 * 仓颉分析器报告的可供程序判断的错误类别。
 */
export type CjslashErrorCode = 'SDK_NOT_FOUND' | 'SDK_INVALID' | 'LSP_START_FAILED' | 'LSP_EXITED' | 'LSP_TIMEOUT' | 'INVALID_NOTATION' | 'INVALID_CJPM_TOML' | 'UNSUPPORTED_FEATURE' | 'INVALID_QUERY' | 'INVALID_COMPLETION' | 'UNEXPECTED_DIAGNOSTIC' | 'DISPOSED'

/**
 * An analyzer failure, optionally carrying diagnostics in original input coordinates.
 *
 * ---
 *
 * 分析器运行错误，可附带使用原始输入坐标的诊断信息。
 */
export class CjslashError extends Error {
  /**
   * A stable category for handling the failure programmatically.
   *
   * ---
   *
   * 用于通过程序处理错误的稳定类别。
   */
  readonly code: CjslashErrorCode

  /**
   * Unexpected diagnostics before output cropping, when available.
   *
   * ---
   *
   * 输出裁剪前的非预期诊断，没有相关诊断时为空。
   */
  readonly diagnostics?: NodeError[]

  /**
   * Create an analyzer error with its category, message, cause, and diagnostics.
   *
   * ---
   *
   * 使用错误类别、消息、原始原因和诊断创建分析器错误。
   */
  constructor(code: CjslashErrorCode, message: string, options?: ErrorOptions & { diagnostics?: NodeError[] }) {
    super(message, options)
    this.name = 'CjslashError'
    this.code = code
    this.diagnostics = options?.diagnostics
  }
}
