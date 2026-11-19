---
description: 认识 Cjslash，以及仓颉文档中的类型悬浮、类型查询和编译诊断。
---

# 认识 Cjslash

Cjslash 让仓颉代码示例带上编译器提供的类型信息。作者编写完整的 `.cj` 示例，Cjslash 调用本地仓颉 SDK 的语言服务器，收集类型签名和诊断，再交给 Shiki 或 VitePress 渲染。

读者可以悬停符号查看类型，通过 `^?` 阅读显式查询结果，也可以在教学反例中看到真实的编译诊断。分析发生在文档开发或构建阶段，浏览器负责展示结果，无需运行仓颉 SDK。

## 从普通代码到类型感知

普通代码块展示源码：

```cj
let answer = 42
main() { println(answer) }
```

给代码块添加 `cjslash` 元信息，并在需要查询的符号下方写上 `^?`：

````md
```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```
````

启用 SDK 分析后，得到可交互的结果：

```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```

`^` 与上一行目标符号的列对齐。标记行会从展示代码中移除，类型信息来自 SDK，示例中的 `answer` 会被推断为 `Int64`。

## 用真实诊断解释反例

通过 `@errors` 声明示例允许出现的诊断编号，就可以在保留诊断校验的同时展示错误：

```cj cjslash
// @errors: 731
main() {
    let value: Int64 = "bad"
    println(value)
}
```

这里的 `731` 是仓颉 SDK 1.2.1 对该类型不匹配返回的编号。诊断文本和编号可能随 SDK 版本改变；编写反例时应以实际使用的 SDK 为准。

未声明的诊断默认使分析失败，帮助作者发现示例中的意外错误。完整规则见[注释标记](../refs/notations)。

## 选择接入方式

| 目标 | 使用的包 | 入口 |
| --- | --- | --- |
| 在 VitePress 文档中使用交互代码块 | `@cjslash/vitepress` | [`vitePluginCjslash()`](./vitepress) |
| 在自定义渲染流程中生成高亮 HTML | `@cjslash/shiki` | [`transformerCjslash()`](./highlight) |
| 分析源码，自己处理结果 | `cjslash` | [`createCjslasher()`](./install) |
| 使用节点、位置和结果类型 | `@cjslash/protocol` | [协议与结果](../refs/result) |

VitePress 用户可以直接从 [VitePress 集成](./vitepress)开始，只需在 Vite 配置中调用 `vitePluginCjslash()`。

## 与 Twoslash 的关系

Cjslash 的注释语法和结果协议参考 [Twoslash](https://twoslash.netlify.app/guide/)，高亮和悬浮层尽量复用上游实现。本文档也按指南、集成和参考组织内容。

分析器使用仓颉 LSP，提供异步 API。支持类型查询、`^|` 补全和通过 `@filename` 组织的同模块多文件示例。编译产物展示尚未实现；迁移时可查看[与 Twoslash 的关系](./compatibility)。
