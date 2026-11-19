---
outline: deep
description: 分析器配置、单次执行选项、Handbook 标记选项与高亮集成选项。
---

# 配置选项

## 分析器配置 {#analyzer-options}

`createCjslasher(options)` 接收 `CjslashOptions`，同时接受下节的默认执行选项，但不接受实例级 `signal`。

| 选项 | 类型 | 默认值与说明 |
| --- | --- | --- |
| `sdkPath` | `string` | 必填，SDK 根目录 |
| `workspaceRoot` | `string` | 工程生成的父目录，默认为系统临时目录 |
| `platform` | `NodeJS.Platform` | `process.platform`，用于定位 SDK 可执行文件和运行时库 |
| `arch` | `NodeJS.Architecture` | `process.arch`，用于定位运行时库 |
| `timeout` | `number` | `30_000`，初始化或单次分析的时间上限，单位毫秒 |
| `cjpmToml` | `CjpmToml` | 可序列化的 JavaScript 对象，合并到临时工程清单 |
| `autoInstallDependencies` | `boolean` | `true`，自动下载配置对象或源码注释中声明的未缓存依赖 |

`timeout` 必须是 `1` 至 `2_147_483_647` 之间的整数。无效值会抛出 `RangeError`。

### 临时工程配置

通过 `workspaceRoot` 指定工程生成的父目录。相对路径以创建分析器时的当前工作目录为基准，不存在的目录会自动创建。每次分析仍使用独立的 `cjslash-<随机值>/<根模块名>/` 子目录；分析结束或初始化失败后只清理该次生成的子目录，保留父目录及其他文件。

`cjpmToml` 接收可序列化的 JavaScript 对象，先与默认配置合并，再通过 `confbox` 的 `stringifyTOML` 序列化并写入临时工程的 `cjpm.toml`：

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  workspaceRoot: './.cjslash',
  cjpmToml: {
    package: {
      'version': '0.2.0',
      'output-type': 'static',
      'src-dir': 'src',
    },
  },
})
```

生成清单的默认版本是 `0.1.0`，`cjc-version` 来自当前 SDK。`package.name` 始终跟随源码顶部包声明的根模块名。`package.src-dir` 默认为 `src`，可以覆盖为工程内的相对目录，不能使用绝对路径或包含 `..`。

`CjpmToml`、`CjpmTomlSection` 和 `CjpmTomlValue` 均从 `cjslash` 导出，可用于配置对象的类型标注。不接受 TOML 字符串；对象结构不合法或无法序列化时抛出 `INVALID_CJPM_TOML`。

额外配置不会把其他 Markdown 代码块变成当前工程中的文件。同一代码块的多文件示例使用 [`@filename`](./notations#files)，不同代码块仍使用隔离的工程。

`cjpmToml` 也可以传给单次 `analyze()`，并通过 [`@package.version`、`@dependencies.<名称>` 等源码注释](./notations#overriding-options)继续覆盖。优先级从低到高为：默认清单、实例配置、单次配置、源码注释。表递归合并，数组整体替换，覆盖只作用于当前代码块。

### 依赖安装与缓存 {#dependency-installation-and-caching}

`autoInstallDependencies` 默认为 `true`。本地 `path` 依赖直接读取源码，未缓存的 Git 或中央仓库依赖通过 SDK 的 `cjpm update --skip-script` 下载。CJPM 的标准输出与错误输出直接显示在当前终端中。

依赖缓存保存在 `workspaceRoot/cjslash-cache/` 下；未设置 `workspaceRoot` 时使用系统临时目录下的同名缓存。缓存按 SDK、依赖名称、版本或 Git 配置及仓库设置区分。成功的解析和下载跨代码块及分析器实例复用；新增依赖只下载未缓存的包，进行中的重复安装共享请求。缓存与单次工程分开保留。

设置 `autoInstallDependencies: false` 可关闭自动下载，仍然允许使用本地和已缓存的依赖。安装失败只输出警告，不退出宿主进程，也不记录为安装成功，后续分析可重试。未能解析的导入仍受正常诊断规则控制；开发预览需要保留此类诊断时，可以使用 `@noErrorValidation`。

## 单次执行选项 {#execute-options}

`analyze(code, 'cj', options)` 接收 `CjslashExecuteOptions`：

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `handbookOptions` | `Partial<CjslashHandbookOptions>` | 覆盖诊断和标记处理规则 |
| `cjpmToml` | `CjpmToml` | 与实例工程配置递归合并，源码注释可继续覆盖 |
| `customTags` | `string[]` | 注册需要提取的 `@tag` 名称 |
| `positionQueries` | `number[]` | 原始源码中的查询偏移 |
| `positionCompletions` | `number[]` | 原始源码中的补全光标偏移，允许位于文件结尾 |
| `positionHighlights` | `[number, number, string?][]` | 原始源码中的 `[start, end, text?]` 高亮 |
| `signal` | `AbortSignal` | 取消当前分析 |
| `shouldGetHoverInfo` | `(identifier, start, filename) => boolean` | 筛选自动 hover 请求，不影响显式查询 |
| `filterNode` | `(node: NodeWithoutPosition) => boolean` | 在诊断校验和裁剪前筛选节点 |

位置均以完整原始输入的 UTF-16 代码单元计算。`filename` 为 `@filename` 声明的规范化相对文件名，默认是 `index.cj`。显式位置可与源码中的查询、补全和高亮标记共同使用。

## Handbook 选项 {#handbook-options}

`CjslashHandbookOptions` 控制示例如何验证和展示：

| 字段 | 默认值 | 行为 |
| --- | --- | --- |
| `errors` | `[]` | 允许出现的诊断编号，支持数字和字符串 |
| `noErrors` | `false` | `true` 抑制全部诊断，数组仅抑制列出的编号 |
| `noErrorValidation` | `false` | 保留诊断，但不检查其编号是否被允许 |
| `noStaticSemanticInfo` | `false` | 关闭自动 hover，保留显式查询和补全 |
| `keepNotations` | `false` | 保留原始代码和标记 |
| `noErrorsCutted` | `false` | 忽略起始位置在隐藏区域内的诊断 |

例如，对所有示例关闭自动 hover，再对单次分析恢复：

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  handbookOptions: { noStaticSemanticInfo: true },
})

const result = await cjslasher.analyze('main() {}', 'cj', {
  handbookOptions: { noStaticSemanticInfo: false },
})
```

配置优先级从低到高为：内置默认值、实例配置、单次配置、源码标记。`handbookOptions` 按字段合并；数组在对应字段被覆盖时整体替换。源码中 `@errors` 等标记的写法见[注释标记](./notations)。

## Shiki transformer 选项 {#shiki-options}

`@cjslash/shiki` 的 `TransformerCjslashOptions` 继承适用的 `TransformerTwoslashOptions`：

| 字段 | 默认值与说明 |
| --- | --- |
| `cjslasher` | 必填，借用的 `Cjslash['analyze']` 函数 |
| `cjslashOptions` | 每次准备使用的固定执行选项 |
| `langs` | `['cj']` |
| `langAlias` | `cangjie`、`Cangjie` 映射到 `cj` |
| `explicitTrigger` | 默认不要求触发词；`true` 要求 `cjslash`，也可传正则 |
| `disableTriggers` | `['nocjslash', 'no-cjslash']` |
| `rendererRich` | 上游富文本渲染选项，默认保留仓颉签名 |
| `renderer` | 上游自定义渲染器 |
| `filter` | 使用完整 Shiki 配置和上下文执行 |
| `throws`、`onTwoslashError`、`onShikiError` | 沿用上游同步渲染错误处理 |

`prepare()` 的异步错误由调用方处理，不能通过同步渲染回调捕获。

## VitePress 插件选项 {#vitepress-options}

`VitePluginCjslashOptions` 复用分析器的 SDK 配置和底层 transformer 的渲染选项：

| 字段 | 默认值与说明 |
| --- | --- |
| `sdkPath` | 可选，优先于 `CJSLASH_SDK_PATH` 和 `CANGJIE_HOME` |
| `platform`、`arch`、`workspaceRoot`、`cjpmToml`、`autoInstallDependencies`、`timeout` | 创建内部分析器时使用 |
| `cjslasher` | 可选，借用现有分析函数；其持有方负责释放 |
| `injectClient` | 默认 `true`，自动注入客户端和样式 |
| `allowUnprepared` | 默认 `true`，未准备的渲染使用静态高亮 |
| `cjslashOptions` | 所有代码块共用的执行选项 |
| `explicitTrigger` | 默认要求 `cjslash`，可设为 `false` 或正则 |
| `disableTriggers`、`langs`、`langAlias` | 与 Shiki 集成的默认值相同 |
| `errorRendering`、`floatingVue`、`renderer` | 上游 VitePress 渲染配置 |
| `processHoverInfo` | 默认保留仓颉签名 |
| `filter`、`throws`、`onTwoslashError`、`onShikiError` | 上游筛选与错误处理 |

底层 `VitePressPluginCjslashOptions` 要求提供 `cjslasher`，`allowUnprepared` 默认为 `false`。传入已有 transformer 的插件重载不自动安装客户端。

不提供 TypeScript `compilerOptions`、同步 `twoslasher`、`twoslashOptions`、`typesCache` 或 `includesMap`。适配关系见[兼容性说明](../guide/compatibility)。
