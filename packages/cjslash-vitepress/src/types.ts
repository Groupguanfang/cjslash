import type { Cjslash, CjslashExecuteOptions, CjslashOptions } from '@cjslash/core'
import type { CjslashShikiTransformer } from '@cjslash/shiki'
import type { VitePressPluginTwoslashOptions } from '@shikijs/vitepress-twoslash'

/**
 * Upstream VitePress twoslash options with an asynchronous Cangjie analyzer.
 *
 * TypeScript compiler, synchronous twoslasher, and cache options are omitted.
 * `explicitTrigger` defaults to `true` and uses `cjslash` as its trigger.
 *
 * ---
 *
 * 使用异步仓颉分析器的上游 VitePress twoslash 配置。
 *
 * TypeScript 编译器、同步 twoslasher 和缓存配置已移除。
 * `explicitTrigger` 默认为 `true`，并使用 `cjslash` 作为触发词。
 */
export interface VitePressPluginCjslashOptions extends Omit<VitePressPluginTwoslashOptions, 'twoslasher' | 'twoslashOptions' | 'typesCache' | 'includesMap'> {
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
   * Render sources that bypass the Vite preparation hook without analysis.
   *
   * Enable this for VitePress features that render Markdown outside Vite's
   * module transform, such as local search indexing. Page rendering still
   * requires the exact source to be prepared.
   *
   * ---
   *
   * 不以分析结果拦截绕过 Vite 准备钩子的源码。
   *
   * 适用于在 Vite 模块转换之外渲染 Markdown 的 VitePress 功能，例如本地搜索索引。
   * 页面渲染仍要求精确的原始源码已完成准备。
   */
  allowUnprepared?: boolean

  /**
   * Fixed execution options shared by every prepared code block.
   *
   * ---
   *
   * 每个已准备代码块共用的固定执行配置。
   */
  cjslashOptions?: CjslashExecuteOptions
}

/**
 * Configure the complete VitePress integration with one Vite plugin.
 *
 * SDK and workspace settings reuse the analyzer's options. When `sdkPath` is omitted, the
 * plugin reads `CJSLASH_SDK_PATH` or `CANGJIE_HOME` through Vite's environment
 * loader. Without an SDK or a borrowed analyzer, only static highlighting is
 * installed. Owned analyzers are created lazily and disposed by Vite.
 *
 * ---
 *
 * 通过一个 Vite 插件配置完整的 VitePress 集成。
 *
 * SDK 和工作区配置复用分析器的选项。省略 `sdkPath` 时，插件通过 Vite 的环境加载器
 * 读取 `CJSLASH_SDK_PATH` 或 `CANGJIE_HOME`。没有 SDK 或借用的分析器时，
 * 仅安装静态高亮。插件持有的分析器会按需创建，并由 Vite 生命周期释放。
 */
export interface VitePluginCjslashOptions extends Omit<VitePressPluginCjslashOptions, 'cjslasher'>, Partial<Pick<CjslashOptions, 'sdkPath' | 'workspaceRoot' | 'platform' | 'arch' | 'cjpmToml' | 'autoInstallDependencies' | 'timeout'>> {
  /**
   * Borrow an existing analysis function instead of creating an analyzer.
   *
   * Its owner remains responsible for asynchronous disposal.
   *
   * ---
   *
   * 借用现有的分析函数，而不创建分析器。
   *
   * 分析器仍由其持有方负责异步释放。
   */
  cjslasher?: Cjslash['analyze']

  /**
   * Install the shared FloatingVue client and stylesheet through the theme entry.
   *
   * Defaults to `true`. Set to `false` when the theme installs them manually.
   * Existing theme exports and application hooks are preserved.
   *
   * ---
   *
   * 通过主题入口安装共用的 FloatingVue 客户端和样式。
   *
   * 默认为 `true`，主题手动安装时可设为 `false`。
   * 现有主题的导出与应用钩子会保留。
   */
  injectClient?: boolean
}

/**
 * A VitePress transformer with asynchronous source and Markdown preparation.
 *
 * ---
 *
 * 提供源码和 Markdown 异步准备的 VitePress transformer。
 */
export interface CjslashVitePressTransformer extends CjslashShikiTransformer {
  /**
   * Prepare matching Markdown fences using VitePress's source normalization.
   *
   * Normally called by `vitePluginCjslash` before each Markdown render.
   * With a custom `filter`, all fences are prepared and the filter runs upstream
   * during rendering with the full Shiki options and context.
   * Preparation failures remain available to upstream rendering error handlers.
   *
   * ---
   *
   * 按 VitePress 的源码标准化规则准备匹配的 Markdown 围栏。
   *
   * 通常由 `vitePluginCjslash` 在每次 Markdown 渲染前调用。
   * 提供自定义 `filter` 时会准备所有围栏，再由上游渲染阶段
   * 使用完整 Shiki 配置和上下文执行筛选。
   * 准备失败会保留给上游的渲染错误处理器。
   */
  prepareMarkdown(source: string): Promise<void>
}
