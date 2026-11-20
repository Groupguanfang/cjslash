import type { Cjslash, CjslashExecuteOptions } from '@cjslash/core'
import type { CjslashResult } from '@cjslash/protocol'
import type { RendererRichOptions, TransformerTwoslashOptions } from '@shikijs/twoslash/core'
import type { ShikiTransformer } from 'shiki'

/**
 * Upstream Shiki transformer options with an asynchronous Cangjie analyzer.
 *
 * Execution options are captured at creation. Preparation failures reject directly;
 * `throws` and the upstream error callbacks apply to synchronous rendering.
 *
 * Defaults to `cj` with `cangjie` and `Cangjie` aliases. An enabled `explicitTrigger`
 * requires `cjslash` in code block metadata; `nocjslash` and `no-cjslash` disable it.
 *
 * ---
 *
 * 使用异步仓颉分析器的上游 Shiki transformer 配置。
 *
 * 执行配置在创建时保存。准备失败会直接拒绝 Promise；
 * `throws` 和上游错误回调用于同步渲染阶段。
 *
 * 默认使用 `cj` 及 `cangjie`、`Cangjie` 别名。启用 `explicitTrigger` 后要求代码块
 * 元信息包含 `cjslash`；`nocjslash` 和 `no-cjslash` 可禁用转换。
 */
export interface TransformerCjslashOptions extends Omit<TransformerTwoslashOptions, 'twoslasher' | 'twoslashOptions' | 'typesCache' | 'includesMap'> {
  /**
   * Analysis function borrowed from an existing Cangjie analyzer.
   *
   * Its owner remains responsible for asynchronous disposal.
   *
   * ---
   *
   * 从现有仓颉分析器借用的分析函数。
   *
   * 分析器仍由其持有方负责异步释放。
   */
  cjslasher: Cjslash['analyze']

  /**
   * Fixed execution options shared by every example prepared by this transformer.
   *
   * ---
   *
   * 此 transformer 准备所有示例时共用的固定执行配置。
   */
  cjslashOptions?: CjslashExecuteOptions

  /**
   * Upstream rich renderer options used when no custom `renderer` is supplied.
   *
   * Hover signatures are preserved by default.
   *
   * ---
   *
   * 未提供自定义 `renderer` 时使用的上游富文本渲染配置。
   *
   * 默认保留原始 hover 签名。
   */
  rendererRich?: RendererRichOptions
}

/**
 * A synchronous Shiki transformer with an asynchronous preparation step.
 *
 * ---
 *
 * 提供异步准备步骤的同步 Shiki transformer。
 */
export interface CjslashShikiTransformer extends ShikiTransformer {
  /**
   * Analyze and cache the exact original source passed to Shiki.
   *
   * Concurrent preparations of the same source share a promise. Successful results
   * are reused within this transformer, and failed preparations can be retried.
   *
   * ---
   *
   * 分析并缓存将传给 Shiki 的完整原始源码。
   *
   * 同一源码的并发准备共享 Promise；成功结果在此 transformer 内复用，
   * 准备失败后可以重试。
   */
  prepare(code: string): Promise<CjslashResult>
}
