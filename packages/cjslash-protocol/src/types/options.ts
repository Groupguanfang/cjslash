import type { NodeError } from 'twoslash-protocol'

/**
 * A numeric or string diagnostic code derived from the upstream `NodeError` type.
 *
 * ---
 *
 * 从上游 `NodeError` 类型派生的诊断编号，支持数字和字符串。
 */
export type CjslashDiagnosticCode = NonNullable<NodeError['code']>

/**
 * Options controlling diagnostics and annotations in a Cangjie code example.
 *
 * ---
 *
 * 控制仓颉代码示例中诊断和注释标记处理的选项。
 */
export interface CjslashHandbookOptions {
  /**
   * Diagnostic codes allowed to occur in the example.
   *
   * ---
   *
   * 允许在此示例中出现的诊断编号。
   */
  errors: CjslashDiagnosticCode[]

  /**
   * Suppress all diagnostics when `true`, or only the listed codes when an array is provided.
   *
   * ---
   *
   * 设为 `true` 时抑制全部诊断；提供数组时，仅抑制其中指定编号的诊断。
   */
  noErrors: boolean | CjslashDiagnosticCode[]

  /**
   * Skip expected-diagnostic validation while retaining diagnostics in the result.
   *
   * ---
   *
   * 跳过预期诊断校验，同时保留结果中的诊断信息。
   */
  noErrorValidation: boolean

  /**
   * Disable automatic hover collection while retaining explicit `^?` queries.
   *
   * ---
   *
   * 关闭自动 hover 信息收集，同时保留显式的 `^?` 查询。
   */
  noStaticSemanticInfo: boolean

  /**
   * Preserve the original code and its annotations, with node positions referring to that input.
   *
   * ---
   *
   * 保留原始代码及其注释标记，节点位置对应原始输入代码。
   */
  keepNotations: boolean

  /**
   * Ignore diagnostics in code ranges marked for removal from the displayed result.
   *
   * ---
   *
   * 忽略被标记为从展示结果中裁剪的代码区间内的诊断。
   */
  noErrorsCutted: boolean
}
