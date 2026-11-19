---
outline: deep
description: CjslashResult 的节点、分类视图、元数据，以及 UTF-16 坐标与裁剪约定。
---

# 分析结果

`analyze()` 返回 `CjslashResult`。它继承 `twoslash-protocol` 的 `TwoslashGenericResult`，保留上游节点形状，增加仓颉元数据和分类 getter。

## 顶层字段

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `code` | `string` | 最终用于展示的源码 |
| `extension` | `'cj'` | 输出语言扩展名 |
| `nodes` | `TwoslashNode[]` | 所有类型、诊断与标记节点 |
| `meta` | `CjslashResultMeta` | 配置和原始源码位置的元数据 |
| `hovers` | `NodeHover[]` | 自动 hover 节点 |
| `queries` | `NodeQuery[]` | 显式类型查询节点 |
| `errors` | `NodeError[]` | 诊断节点，包含警告等其他级别 |
| `highlights` | `NodeHighlight[]` | 范围高亮节点 |
| `tags` | `NodeTag[]` | 自定义注释标签 |
| `completions` | `NodeCompletion[]` | `^\|` 或显式位置触发的补全节点 |

`nodes` 是唯一节点数据源，其余分类视图每次读取时从 `nodes` 派生。

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('let answer = 42\n//  ^?\nmain() { println(answer) }\n')
const query = result.queries[0]

if (query) {
  console.log(query.text)
  console.log(result.code.slice(query.start, query.start + query.length))
}
```

后一项输出查询目标 `answer`。

## 信息节点

节点通过 `type` 区分，位置字段保留上游形状：

| 公共字段 | 含义 |
| --- | --- |
| `type` | `hover`、`query`、`error`、`highlight`、`tag` 或 `completion` |
| `start` | 输出源码中的起始偏移，从零开始 |
| `length` | 范围长度，允许为零 |
| `line` | 起始行号，从零开始 |
| `character` | 起始列号，从零开始 |

常用的类型专属字段：

| 节点 | 字段 |
| --- | --- |
| `hover`、`query` | `target` 为目标源码，`text` 为签名，可包含 `docs` |
| `error` | `text` 为诊断消息，可包含 `code`、`level`、`filename` 和 `id` |
| `highlight` | 可包含说明 `text` |
| `tag` | `name` 为标签名称，`text` 为可选内容 |
| `completion` | `completions` 为 `{ name, kind? }[]`，`completionsPrefix` 为输入前缀，`length` 为 `0` |

使用 `node.type` 收窄联合类型后读取对应字段。`NodeHover`、`NodeQuery` 等直接来自 `twoslash-protocol`，没有额外的仓颉节点格式。

## 坐标与裁剪

`start`、`length`、`character` 和显式位置参数使用 UTF-16 代码单元，而不是字节或视觉字符宽度。JavaScript 的字符串索引与 `slice()` 使用同样的单位；例如 emoji 可能占用两个代码单元。

| 数据 | 坐标基准 |
| --- | --- |
| `result.nodes` 和分类 getter | 最终的 `result.code` |
| `result.meta.removals` | 原始输入 |
| `result.meta.positionQueries` | 原始输入 |
| `result.meta.positionCompletions` | 原始输入 |
| `result.meta.positionHighlights` | 原始输入 |
| `CjslashError.diagnostics` | 失败分析的原始输入 |

节点区间为 `[start, start + length)`。裁剪和高亮区间为 `[start, end)`，右端点不包含在范围内。

默认情况下，移除标记和隐藏代码后会重新计算节点位置。启用 `keepNotations` 时，`result.code` 保持原始输入，节点也对应原始输入；`meta.removals` 仍记录原本应移除的范围。

## 元数据

| `CjslashResultMeta` 字段 | 含义 |
| --- | --- |
| `extension` | 固定为 `cj` |
| `handbookOptions` | 应用默认值、调用配置和源码标记后的完整选项 |
| `removals` | 原始输入中需要移除的区间 |
| `positionQueries` | 原始输入中的显式查询偏移 |
| `positionCompletions` | 原始输入中的补全光标偏移 |
| `positionHighlights` | 原始输入中的 `[start, end, text?]` 高亮范围 |

元数据用于关联作者输入和最终展示。交给 Shiki 时仍传原始源码，由 transformer 读取准备好的结果。

多文件示例的节点偏移和行号仍对应完整代码块，不会在新文件处归零。诊断的 `filename` 对应相应的虚拟文件名；裁剪不会改变这个文件名。

## 协议工具

从 `@cjslash/protocol` 可以直接导入上游的 `Position`、`Range`、`TwoslashNode`、`NodeWithoutPosition` 和节点类型，以及以下工具：

`createPositionConverter`、`splitLines`、`isInRange`、`isInRanges`、`mergeRanges`、`removeCodeRanges`、`resolveNodePositions`。

这些工具保留各自的上游语义。例如 `isInRange` 默认包含两个端点，不能直接把它的默认行为当作上文的半开区间判断。

## 序列化

保存或传输结果时，可以将 `code`、`extension`、`nodes` 和 `meta` 作为数据。JSON 解析不会恢复 getter；需要动态分类视图时，按 `node.type` 从恢复后的 `nodes` 派生。核心 API 不提供独立的缓存恢复工厂。
