---
description: Cjslash 与 Twoslash 的接口复用、异步分析差异和当前功能范围。
---

# 与 Twoslash 的关系

Cjslash 保留 Twoslash 适合仓颉的注释语法与数据形状，使用仓颉 SDK 提供语义信息。熟悉 Twoslash 的作者可以继续使用查询、裁剪和诊断标记；接入时需要使用仓颉分析器和异步准备流程。

## 包之间的对应关系

| Twoslash 生态 | Cjslash 生态 | 职责 |
| --- | --- | --- |
| `twoslash-protocol` | `@cjslash/protocol` | 节点、位置、结果协议 |
| `twoslash` | `@cjslash/core` | 分析源码并返回结构化结果 |
| `@shikijs/twoslash` | `@cjslash/shiki` | 将分析结果渲染为高亮 HTML |
| `@shikijs/vitepress-twoslash` | `@cjslash/vitepress` | 接入 VitePress 与悬浮层客户端 |

上游节点类型、渲染器接口和可直接复用的工具会直接导出。需要额外信息的接口继承上游；不适用于仓颉的形状由仓颉接口替代。

## 分析器 API

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('main() {}', 'cj')
```

`createCjslasher()` 返回 Promise，实例通过 `analyze()` 分析源码，通过 `[Symbol.asyncDispose]()` 释放。它不返回可直接调用的同步函数，也不提供上游的 TypeScript 语言服务缓存 API。

每次分析使用独立工程和 LSP 会话。同一实例中的调用依次执行；需要并行时，应由调用方创建多个实例并分别管理生命周期。

## 已支持的标记

| 标记 | 支持情况 |
| --- | --- |
| `^?` | 从上一行对应位置查询类型 |
| `^\|` | 请求光标位置的补全候选，按标识符前缀筛选 |
| `@filename` | 同一根模块中的多文件示例，支持跨文件查询与导入 |
| 连续的 `^^` | 高亮指定范围，可附说明 |
| `---cut---`、`---cut-before---`、`---cut-after---` | 隐藏前置或后置源码 |
| `---cut-start---`、`---cut-end---` | 成对隐藏源码片段 |
| `@errors`、`@noErrors`、`@noErrorValidation` | 控制诊断校验和展示 |
| `@noErrorsCutted` | 忽略隐藏部分中的诊断 |
| `@noStaticSemanticInfo`、`@keepNotations` | 控制自动 hover 与标记保留 |
| 注册的 `@tag` | 提取自定义标签 |

仓颉诊断编号可以是数字或字符串。`@errors` 使用仓颉 SDK 的编号，不能直接照搬 TypeScript 示例中的编号。

## 当前功能边界

目前支持单文件及同一根模块中的多文件 `.cj` 示例。以下标记会报 `UNSUPPORTED_FEATURE`：

- `@showEmit`、`@showEmittedFile` 等编译产物展示。
- TypeScript 的 `@target`、`@lib` 等编译器配置标记。

补全复用上游 `NodeCompletion`、`CompletionEntry` 和渲染器。SDK 必须声明支持补全；没有补全能力的 SDK 仍可分析普通示例。`@filename` 文件必须共享一个根模块，目录与各自的 `package` 声明一致，详见[多文件示例](../refs/notations#files)。

编译产物展示需要额外的编译流程，尚未实现。TypeScript 编译选项不适用于仓颉；SDK 工程通过 `cjpmToml` 以及 `@package.version`、`@dependencies.<名称>` 等[字段覆盖注释](../refs/notations#overriding-options)配置。

## 高亮器的区别

`@cjslash/shiki` 需要先等待 `transformer.prepare(source)`，然后用同一份原始源码同步渲染。`@cjslash/vitepress` 的 `vitePluginCjslash()` 自动完成准备。

Shiki transformer 默认转换支持的语言；VitePress 插件默认要求围栏带 `cjslash`。两者都接受 `explicitTrigger`，都默认识别 `nocjslash` 和 `no-cjslash`。

`twoslasher`、`twoslashOptions`、`typesCache` 和 `includesMap` 不在仓颉 transformer 的选项中。使用 `cjslasher`、`cjslashOptions`，多文件示例通过 `@filename` 组织。

## 阅读上游文档

本文档参考 Twoslash 的[入门指南](https://twoslash.netlify.app/guide/)和[标记参考](https://twoslash.netlify.app/refs/notations)，展示与渲染接口来自 Shiki 的 [Twoslash 集成](https://shiki.style/packages/twoslash)和 [VitePress 集成](https://shiki.style/packages/vitepress)。涉及仓颉支持范围时，以本项目的 API 与文档为准。
