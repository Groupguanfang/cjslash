import type { CjslashHandbookOptions, CjslashResult, CjslashResultMeta, NodeWithoutPosition } from '@cjslash/protocol'

/**
 * Options for one analysis. Explicit positions refer to the original input.
 *
 * ---
 *
 * 单次分析的选项，显式指定的位置均对应原始输入。
 */
export interface CjslashExecuteOptions extends Partial<Pick<CjslashResultMeta, 'positionQueries' | 'positionCompletions' | 'positionHighlights'>> {
  /**
   * Serializable `cjpm.toml` overrides merged with instance settings and source annotations.
   *
   * Tables merge recursively, arrays replace previous arrays, and source annotations
   * have the highest priority. The package name follows the source declaration.
   *
   * ---
   *
   * 可序列化的 `cjpm.toml` 覆盖配置，与实例配置及源码注释合并。
   *
   * 表递归合并，数组整体替换，源码注释的优先级最高。包名始终跟随源码声明。
   */
  cjpmToml?: CjpmToml

  /**
   * Overrides for diagnostic handling and annotation processing.
   *
   * ---
   *
   * 覆盖诊断处理和注释标记处理的配置。
   */
  handbookOptions?: Partial<CjslashHandbookOptions>

  /**
   * Custom `@tag` names to extract from whole-line comments.
   *
   * ---
   *
   * 从独占一行的注释中提取的自定义 `@tag` 名称。
   */
  customTags?: string[]

  /**
   * Cancel this analysis without disposing the analyzer.
   *
   * ---
   *
   * 取消本次分析，而不释放分析器实例。
   */
  signal?: AbortSignal

  /**
   * Filter automatic hover requests using original input offsets.
   *
   * ---
   *
   * 使用原始输入中的偏移筛选自动 hover 请求。
   */
  shouldGetHoverInfo?(identifier: string, start: number, filename: string): boolean

  /**
   * Filter nodes before diagnostic validation and output cropping.
   *
   * Node offsets refer to the original input.
   *
   * ---
   *
   * 在诊断校验和输出裁剪前筛选节点。
   *
   * 节点偏移对应原始输入。
   */
  filterNode?(node: NodeWithoutPosition): boolean
}

/**
 * A serializable value allowed in a `cjpm.toml` table.
 *
 * ---
 *
 * `cjpm.toml` 表中允许的可序列化值。
 */
export type CjpmTomlValue = string | number | boolean | Date | CjpmTomlValue[] | CjpmTomlSection

/**
 * A serializable JavaScript object representing one `cjpm.toml` table.
 *
 * ---
 *
 * 表示一个 `cjpm.toml` 表的可序列化 JavaScript 对象。
 */
export interface CjpmTomlSection {
  /**
   * Values and nested tables in this section.
   *
   * ---
   *
   * 该节中的值和嵌套表。
   */
  [key: string]: CjpmTomlValue | undefined
}

/**
 * Serializable JavaScript overrides for the generated `cjpm.toml`.
 *
 * ---
 *
 * 用于生成 `cjpm.toml` 的可序列化 JavaScript 覆盖配置。
 */
export interface CjpmToml extends CjpmTomlSection {
  /**
   * Package metadata merged into the generated manifest.
   *
   * `name` is always replaced by the root module derived from the source.
   *
   * ---
   *
   * 合并到生成清单中的包元数据。
   *
   * `name` 始终会替换为从源码推导出的根模块名。
   */
  package?: CjpmTomlSection
}

/**
 * SDK, workspace, and default options for a Cangjie analyzer.
 *
 * ---
 *
 * 仓颉分析器的 SDK、工作区配置和默认执行选项。
 */
export interface CjslashOptions extends Omit<CjslashExecuteOptions, 'signal'> {
  /**
   * Path to the root directory of the installed Cangjie SDK.
   *
   * ---
   *
   * 已安装的仓颉 SDK 根目录路径。
   */
  readonly sdkPath: string

  /**
   * Parent directory for isolated analysis projects; defaults to the system temporary directory.
   *
   * Relative paths are resolved when the analyzer is created. Missing parent
   * directories are created as needed. Each analysis uses a unique child directory
   * that is removed after analysis, while this parent directory is retained.
   *
   * ---
   *
   * 隔离分析工程的父目录，默认为系统临时目录。
   *
   * 相对路径在创建分析器时解析为绝对路径，不存在的父目录会按需创建。
   * 每次分析使用独立的子目录，分析结束后删除该子目录，保留此父目录。
   */
  readonly workspaceRoot?: string

  /**
   * Operating system used to locate SDK binaries and runtime libraries; defaults to `process.platform`.
   *
   * ---
   *
   * 用于定位 SDK 可执行文件和运行时库的操作系统平台，默认为 `process.platform`。
   */
  readonly platform?: NodeJS.Platform

  /**
   * CPU architecture used to locate runtime libraries; defaults to `process.arch`.
   *
   * ---
   *
   * 用于定位运行时库的 CPU 架构，默认为 `process.arch`。
   */
  readonly arch?: NodeJS.Architecture

  /**
   * Automatically download uncached dependencies declared in `cjpmToml` or source annotations.
   *
   * Defaults to `true`. Setting this to `false` still allows local and cached dependencies.
   * Installation output is streamed to the terminal; failures warn without exiting the host.
   *
   * ---
   *
   * 自动下载 `cjpmToml` 或源码注释中声明的未缓存依赖。
   *
   * 默认为 `true`，设为 `false` 时仍可使用本地及已缓存依赖。
   * 安装输出会实时展示在终端，失败时输出警告，不退出宿主进程。
   */
  readonly autoInstallDependencies?: boolean

  /**
   * Maximum initialization or analysis time in milliseconds; defaults to 30,000.
   *
   * ---
   *
   * 初始化或单次分析的最长时间，单位为毫秒，默认为 30,000。
   */
  readonly timeout?: number
}

/**
 * A Cangjie analyzer creating an isolated LSP session per analysis.
 *
 * ---
 *
 * 在每次分析时创建独立 LSP 会话的仓颉分析器。
 */
export interface Cjslash extends AsyncDisposable {
  /**
   * Creation options with SDK and configured workspace paths resolved to absolute paths.
   *
   * ---
   *
   * 创建实例时的配置，其中 SDK 路径及已配置的工作区路径均解析为绝对路径。
   */
  readonly options: CjslashOptions

  /**
   * Analyze a Cangjie example in a new LSP session, splitting files with `@filename`.
   *
   * The root module and source path follow the top-level package declaration.
   * Calls on the same instance are serialized. Output positions refer to `result.code`.
   *
   * ---
   *
   * 在新的 LSP 会话中分析仓颉示例，可使用 `@filename` 拆分文件。
   *
   * 根模块和源文件路径跟随顶部的包声明。
   * 同一实例上的调用依次执行，输出节点位置对应 `result.code`。
   */
  analyze(code: string, extension?: 'cj', options?: CjslashExecuteOptions): Promise<CjslashResult>

  /**
   * Cancel queued and running work, then stop the active LSP process and remove its temporary files.
   *
   * Repeated calls share the same cleanup promise. Use this instance with `await using`.
   *
   * ---
   *
   * 取消排队及执行中的任务，停止当前 LSP 进程，并删除对应临时文件。
   *
   * 重复调用共享同一个清理 Promise，可通过 `await using` 管理此实例。
   */
  [Symbol.asyncDispose](): Promise<void>
}
