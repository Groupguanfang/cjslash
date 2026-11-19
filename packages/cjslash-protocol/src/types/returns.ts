import type { NodeCompletion, NodeError, NodeHighlight, NodeHover, NodeQuery, NodeTag, Range, TwoslashGenericResult } from 'twoslash-protocol'
import type { CjslashHandbookOptions } from './options'

/**
 * A Twoslash-compatible Cangjie analysis result with metadata and node views.
 *
 * Node positions refer to the output `code`. Offsets and lengths use UTF-16 code units.
 *
 * ---
 *
 * 兼容 Twoslash 的仓颉分析结果，包含元数据和节点分类视图。
 *
 * 节点位置对应输出的 `code`，偏移和长度以 UTF-16 代码单元计量。
 */
export interface CjslashResult extends TwoslashGenericResult {
  /**
   * The output source extension, always `cj` for Cangjie.
   *
   * ---
   *
   * 输出源码的扩展名，仓颉固定使用 `cj`。
   */
  extension: 'cj'

  /**
   * Resolved analysis settings and metadata describing the original input.
   *
   * ---
   *
   * 本次分析采用的配置，以及描述原始输入的元数据。
   */
  meta: CjslashResultMeta

  /**
   * A view of all `hover` nodes derived from `nodes`.
   *
   * ---
   *
   * 从 `nodes` 派生的全部 `hover` 节点视图。
   */
  get hovers(): NodeHover[]

  /**
   * A view of all explicit `query` nodes derived from `nodes`.
   *
   * ---
   *
   * 从 `nodes` 派生的全部显式 `query` 查询节点视图。
   */
  get queries(): NodeQuery[]

  /**
   * A view of all `error` nodes derived from `nodes`, including warnings and other diagnostic levels.
   *
   * ---
   *
   * 从 `nodes` 派生的全部 `error` 节点视图，包含警告及其他级别的诊断。
   */
  get errors(): NodeError[]

  /**
   * A view of all `highlight` nodes derived from `nodes`.
   *
   * ---
   *
   * 从 `nodes` 派生的全部 `highlight` 高亮节点视图。
   */
  get highlights(): NodeHighlight[]

  /**
   * A view of all custom annotation `tag` nodes derived from `nodes`.
   *
   * ---
   *
   * 从 `nodes` 派生的全部自定义注释 `tag` 标签节点视图。
   */
  get tags(): NodeTag[]

  /**
   * A view of all `completion` nodes derived from `nodes`.
   *
   * This view can be empty when completion analysis is unavailable.
   *
   * ---
   *
   * 从 `nodes` 派生的全部 `completion` 补全节点视图。
   *
   * 未提供补全分析能力时，此视图可以为空。
   */
  get completions(): NodeCompletion[]
}

/**
 * Metadata describing analysis settings and positions in the original, untrimmed input.
 *
 * Offsets use zero-based UTF-16 code units. Ranges are half-open: `[start, end)`.
 *
 * ---
 *
 * 描述分析配置及原始未裁剪输入中各项位置的元数据。
 *
 * 偏移以 UTF-16 代码单元计量，从零开始；区间采用左闭右开的 `[start, end)`。
 */
export interface CjslashResultMeta {
  /**
   * The output source extension, always `cj`.
   *
   * ---
   *
   * 输出源码的扩展名，固定为 `cj`。
   */
  extension: 'cj'

  /**
   * The resolved handbook options used for this analysis.
   *
   * ---
   *
   * 本次分析实际采用的完整 handbook 配置。
   */
  handbookOptions: CjslashHandbookOptions

  /**
   * Half-open ranges in the original input marked for removal from the displayed code.
   *
   * These ranges remain recorded when `keepNotations` preserves the original code.
   *
   * ---
   *
   * 原始输入中被标记为从展示代码中裁剪的左闭右开区间。
   *
   * 启用 `keepNotations` 保留原始代码时，仍记录这些区间。
   */
  removals: Range[]

  /**
   * Zero-based UTF-16 offsets of explicit queries in the original input.
   *
   * ---
   *
   * 显式查询在原始输入中的偏移，以 UTF-16 代码单元计量，从零开始。
   */
  positionQueries: number[]

  /**
   * Zero-based UTF-16 cursor offsets of completion queries in the original input.
   *
   * ---
   *
   * 补全查询的光标在原始输入中的偏移，以 UTF-16 代码单元计量，从零开始。
   */
  positionCompletions: number[]

  /**
   * Highlight ranges in the original input as `[start, end, text?]`.
   *
   * Each range is half-open and can carry an optional annotation message.
   *
   * ---
   *
   * 原始输入中的高亮区间，格式为 `[start, end, text?]`。
   *
   * 每个区间均为左闭右开，并可附带一段注释文本。
   */
  positionHighlights: [start: number, end: number, text?: string][]
}

/**
 * Analyze source code asynchronously using the Twoslash-compatible argument shape.
 *
 * - `code`: the original source code.
 * - `extension`: an optional source extension or language hint.
 * - `options`: execution options described by the `Options` type parameter.
 * - Returns a promise resolving to a Twoslash-compatible generic result.
 *
 * ---
 *
 * 使用兼容 Twoslash 的参数形式异步分析源码。
 *
 * - `code`：原始源码。
 * - `extension`：可选的源码扩展名或语言提示。
 * - `options`：由 `Options` 类型参数描述的执行选项。
 * - 返回一个解析为兼容 Twoslash 的通用结果的 Promise。
 */
export type CjslashGenericFunction<Options = never> = (
  code: string,
  extension?: string,
  options?: Options,
) => Promise<TwoslashGenericResult>
