# @cjslash/protocol

仓颉代码分析与展示的数据协议，兼容 `twoslash-protocol`。

## 上游接口复用

| 情况 | 处理方式 |
| --- | --- |
| 形状和语义可以直接使用 | 显式重导出上游类型或工具 |
| 可以使用上游形状，需要增加信息 | 继承上游接口 |
| 上游形状与仓颉需求不兼容 | 定义适用的接口，不重导出该上游接口 |

以下类型直接来自 `twoslash-protocol`：

- 节点：`NodeBase`、`NodeStartLength`、`NodeHover`、`NodeQuery`、`NodeError`、`NodeHighlight`、`NodeTag`、`NodeCompletion`。
- 节点集合与辅助类型：`TwoslashNode`、`NodeWithoutPosition`、`NodeErrorWithoutPosition`、`CompletionEntry`、`ErrorLevel`。
- 位置与范围：`Position`、`Range`。
- 通用结果：`TwoslashGenericResult`。

位置和裁剪工具也直接重导出，保持上游实现和行为：

`createPositionConverter`、`splitLines`、`isInRange`、`isInRanges`、`mergeRanges`、`removeCodeRanges`、`resolveNodePositions`。

## 仓颉接口

### CjslashResult

继承 `TwoslashGenericResult`，沿用 `code`、`nodes`，将 `extension` 明确为 `cj`，增加 `meta` 和节点分类 getter。

`nodes` 是节点的唯一数据源。`hovers`、`queries`、`errors`、`highlights`、`tags`、`completions` 应当从 `nodes` 派生。缓存恢复时由分析核心重建 getter。

六类节点均保持上游形状。协议包含 `NodeCompletion` 不代表分析核心已经实现补全。

### CjslashResultMeta

记录实际采用的 `handbookOptions`、原始代码的裁剪区间、查询位置和高亮区间。

| 数据 | 坐标基准 |
| --- | --- |
| `result.nodes` | 最终的 `result.code` |
| `meta.removals` | 原始输入代码 |
| `meta.positionQueries` | 原始输入代码 |
| `meta.positionHighlights` | 原始输入代码 |

偏移、长度和列号使用 UTF-16 code unit，行号和列号从零开始。节点区间为 `[start, start + length)`，裁剪和高亮区间为 `[start, end)`。允许零长度节点。

直接重导出的工具保留各自的上游行为，例如 `isInRange` 默认包含两个端点。调用方应当根据区间用途处理边界。

### CjslashHandbookOptions

沿用上游适用的配置名称，诊断编号类型通过 `NodeError['code']` 派生，支持数字和字符串：

| 字段 | 约定 |
| --- | --- |
| `errors` | 允许出现的诊断编号 |
| `noErrors` | 抑制全部诊断，或者抑制给定编号的诊断 |
| `noErrorValidation` | 关闭诊断校验，保留诊断展示 |
| `noStaticSemanticInfo` | 关闭自动 hover，保留显式查询 |
| `keepNotations` | 保留输入代码及标记，节点位置对应原始代码 |
| `noErrorsCutted` | 忽略被裁剪代码中的诊断 |

该接口独立定义，因为上游完整 `twoslash` 包的 `HandbookOptions` 使用数字诊断编号，并包含 JavaScript 编译产物选项。

### CjslashGenericFunction

沿用 `(code, extension?, options?)` 的参数形式，返回 `Promise<TwoslashGenericResult>`。

上游 `TwoslashGenericFunction` 返回同步结果，因此此包不重导出该类型。具体分析函数可以返回包含更多仓颉信息的 `Promise<CjslashResult>`。

SDK 路径、LSP 进程、取消信号和 `[Symbol.asyncDispose]` 属于 `@cjslash/core` 分析核心的职责。
