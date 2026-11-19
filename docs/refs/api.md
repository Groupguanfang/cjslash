---
outline: deep
description: Cjslash 分析器、错误类型，以及 Shiki 和 VitePress 的公开 API。
---

# API 参考

## `createCjslasher(options)`

从 `cjslash` 导出，接收 [`CjslashOptions`](./options#analyzer-options)，返回 `Promise<Cjslash>`：

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('main() {}')
```

创建时校验 SDK，并将 SDK 路径和已配置的 `workspaceRoot` 解析为绝对路径。临时工程和 LSP 会话在每次分析时创建，结束后清理；`workspaceRoot` 指定的父目录会保留。

### `cjslasher.options`

只读的创建配置，包含解析为绝对路径的 `sdkPath` 和已配置的 `workspaceRoot`。

### `cjslasher.analyze(code, extension?, options?)`

返回 `Promise<CjslashResult>`：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string` | 完整的原始源码，可使用 `@filename` 分隔同模块文件 |
| `extension` | `'cj'` | 可省略，默认 `cj` |
| `options` | `CjslashExecuteOptions` | 单次分析覆盖项 |

同一实例的调用依次执行。创建时的执行配置作为默认值；单次选项覆盖默认值，`handbookOptions` 按字段合并，源码标记再覆盖对应选项。

### `cjslasher[Symbol.asyncDispose]()`

返回 `Promise<void>`，取消当前和排队任务，并等待清理。可以直接调用，也可以由 `await using` 自动调用。重复调用共享同一个 Promise，已释放实例的分析会报告 `DISPOSED`。

## 取消单次分析

单次执行选项接受 `AbortSignal`：

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const abortController = new AbortController()
const pending = cjslasher.analyze('main() {}', 'cj', {
  signal: abortController.signal,
})

abortController.abort()
await pending.catch((error: unknown): void => {
  console.error(error)
})
```

取消不等于释放分析器，后续调用仍可分析。取消原因沿用信号的原因，不保证为 `CjslashError`。

## `CjslashError` {#errors}

从 `cjslash` 导出，继承 `Error`，提供稳定的 `code`、可选 `cause` 和可选 `diagnostics`。非预期诊断附带的节点使用**原始输入坐标**，便于定位源文件。

```ts twoslash
import { CjslashError, createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })

try {
  await cjslasher.analyze('main() { let value: Int64 = "bad"; println(value) }')
}
catch (error) {
  if (error instanceof CjslashError) {
    console.error(error.code, error.diagnostics)
  }
  else {
    throw error
  }
}
```

| `CjslashErrorCode` | 含义 |
| --- | --- |
| `SDK_NOT_FOUND` | SDK 路径或必需的可执行文件不可用 |
| `SDK_INVALID` | 编译器执行或版本校验失败 |
| `LSP_START_FAILED` | LSP 进程无法启动 |
| `LSP_EXITED` | LSP 意外退出 |
| `LSP_TIMEOUT` | LSP 初始化或分析超时 |
| `INVALID_NOTATION` | 标记格式、配对或范围无效 |
| `INVALID_CJPM_TOML` | `cjpmToml` 对象结构不合法或无法序列化为 TOML |
| `UNSUPPORTED_FEATURE` | 不支持的扩展名或标记 |
| `INVALID_QUERY` | 查询位置无效或 SDK 未返回该位置的类型 |
| `INVALID_COMPLETION` | 补全光标位置无效或 SDK 未返回匹配候选 |
| `UNEXPECTED_DIAGNOSTIC` | 出现未允许的诊断 |
| `DISPOSED` | 分析器已经释放 |

## Shiki API

从 `@cjslash/shiki` 导出：

| 导出 | 作用 |
| --- | --- |
| `transformerCjslash(options)` | 创建 `CjslashShikiTransformer` |
| `transformer.prepare(code)` | 异步分析并缓存原始源码，返回 `Promise<CjslashResult>` |
| `cangjieLanguage` | 随包提供的仓颉 TextMate 语法 |
| `rendererClassic`、`rendererRich` | 上游渲染器工厂 |
| `ShikiTwoslashError` | 上游高亮错误类型 |

`TransformerCjslashOptions` 继承适用的上游选项，`CjslashShikiTransformer` 继承 `ShikiTransformer` 并增加 `prepare()`。`HastExtension`、`RendererRichOptions`、`TwoslashRenderer` 直接重导出。

使用流程与生命周期见 [Shiki 语法高亮](../guide/highlight)。

## VitePress API

从 `@cjslash/vitepress` 导出：

| 导出 | 作用 |
| --- | --- |
| `vitePluginCjslash(options?)` | 单函数配置 VitePress 集成，返回 Vite 插件 |
| `vitePluginCjslash(transformer)` | 接入已有 transformer，不自动安装客户端 |
| `transformerCjslash(options)` | 创建底层 `CjslashVitePressTransformer` |
| `transformer.prepare(code)` | 准备精确的原始源码 |
| `transformer.prepareMarkdown(source)` | 准备 Markdown 中匹配的围栏，返回 `Promise<void>` |
| `rendererFloatingVue` | 上游 FloatingVue 渲染器 |
| `cangjieLanguage`、`ShikiTwoslashError` | 共用语法和上游错误类型 |

还导出 `VitePluginCjslashOptions`、`VitePressPluginCjslashOptions`、`CjslashVitePressTransformer`，以及上游 `TwoslashFloatingVueOptions` 和 `TwoslashFloatingVueRendererOptions`。

需要手动安装客户端时，从 `@cjslash/vitepress/client` 导入默认 Vue 插件，并导入 `@cjslash/vitepress/style.css`；`FloatingVueConfig` 由客户端入口重导出。自动接入时无需手动安装，详见 [VitePress 集成](../guide/vitepress)。

## 协议 API

`@cjslash/protocol` 导出仓颉结果与选项类型，以及直接复用的上游节点和位置工具。`CjslashGenericFunction<Options>` 保留 `(code, extension?, options?)` 参数形状，返回 `Promise<TwoslashGenericResult>`。

节点定义与坐标约定见[分析结果](./result)。
