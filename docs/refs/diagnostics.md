---
description: 从本地仓颉 SDK 1.2.1 提取的 997 条诊断编号、级别、名称、消息与提示模板。
---

# 诊断码表

本页记录 **仓颉 SDK 1.2.1** 的诊断快照，包含 **997 条诊断**：924 条错误、67 条警告和 6 条说明。可以按编号、诊断名称或消息搜索，也可以按分类与级别筛选。

## 适用版本

| 项目 | 值 |
| --- | --- |
| 编译器版本 | `Cangjie Compiler: 1.2.1 (cjnative)` |
| SDK 目标平台 | `aarch64-apple-darwin` |
| 数据来源 | SDK 中的 `tools/lib/libcangjie-lsp.dylib` |
| 覆盖范围 | 原始诊断表与重构诊断表中的全部消息条目 |
| 排除项 | 28 个内部 `*_diag_begin` / `*_diag_end` 边界标记 |

数据直接从上述 SDK 动态库提取，不根据当前开发分支的定义顺序推算。编号和消息属于这一份 SDK 快照；其他版本或平台以实际语言服务器返回的诊断为准。

## 如何使用

将表中的数字编号用于 [`@errors` 或 `@noErrors`](./notations#diagnostics)。例如，`776` 对应给不可变值赋值：

```cj cjslash
// @errors: 776
main() {
    let answer = 42
    answer = 43
    println(answer)
}
```

表格保留 SDK 的英文原始消息，便于与编译器输出核对。`%s`、`%d`、`%p` 等是运行时替换的占位符；主提示和附加提示同样是模板，实际内容取决于源码。某些通用条目仅包含 `%s`，完整说明由调用方提供。

级别中的“说明”是附属诊断信息，不一定作为独立 LSP 诊断返回。SDK 内置的编译驱动、宏展开、CHIR 等条目也不一定会在文档的 LSP 分析中触发。

## LSP 补充诊断

语言服务器还会生成不属于编译器固定消息表的诊断。SDK 1.2.1 中实测的例子包括：

| 编号 | Cjslash 级别 | 实测消息示例 |
| --- | --- | --- |
| `0` | `suggestion` | `Variable 'answer' is declared but never used` |
| `0` | `suggestion` | `Parameter '<invalid identifier>' is declared but never used` |

这些诊断共享编号 `0`，消息根据符号生成，不能用编译器表中的 `chir_diag_begin` 解释。它们不计入下方 997 条固定消息。需要允许或抑制这些建议时，可以使用 `@errors: 0` 或 `@noErrors: 0`，并以实际返回的 `text` 区分具体含义。

## 完整表格

<CjslashDiagnostics />

## 来源与维护

诊断名称与模板定义见官方编译器的 [`include/cangjie/Basic/`](https://gitcode.com/Cangjie/cangjie_compiler/tree/main/include/cangjie/Basic) 及其 `DiagRefactor` 子目录。SDK 同时保留两套诊断表：原始表按自身索引编号；重构表按 `sema_diag_end` 的原始编号加自身索引编号。本快照的偏移为 `287`。移除边界标记后，编号之间出现间隔属于正常情况；同名诊断在两套表中也可能拥有不同编号。

提取过程同时保留原始名称、级别、主消息、主提示和全部附加提示。文档仓库中的 `docs/data/diagnostics-1.2.1.json` 保存完整数据和源动态库的 SHA-256；脚本会检查编号唯一性，并核对真实 SDK 测试已确认的 `731` 和 `776`。

在安装了 macOS ARM64 版 SDK 1.2.1 和 `clang++` 的环境中，可以重新生成快照：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie pnpm exec vp run docs:diagnostics
```

普通文档构建使用已提交的快照，无需重新提取诊断表。此表是 Cjslash 提供的版本参考，不是仓颉官方承诺跨版本稳定的错误码规范。诊断模板来自仓颉 SDK，相关上游许可见[仓颉项目许可证](https://cangjie-lang.cn/pages/LICENSE)。
