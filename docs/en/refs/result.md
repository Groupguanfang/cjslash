---
outline: deep
description: CjslashResult nodes, derived views, metadata, and UTF-16 coordinates before and after cropping.
---

# Results

`analyze()` returns `CjslashResult`. It extends `TwoslashGenericResult` from `twoslash-protocol`, preserves upstream node shapes, and adds Cangjie metadata and derived getters.

## Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `code` | `string` | Final source for display |
| `extension` | `'cj'` | Output language extension |
| `nodes` | `TwoslashNode[]` | All semantic, diagnostic, and annotation nodes |
| `meta` | `CjslashResultMeta` | Settings and metadata in original-source coordinates |
| `hovers` | `NodeHover[]` | Automatic hover nodes |
| `queries` | `NodeQuery[]` | Explicit type query nodes |
| `errors` | `NodeError[]` | Diagnostics, including warnings and other levels |
| `highlights` | `NodeHighlight[]` | Range highlights |
| `tags` | `NodeTag[]` | Custom annotation tags |
| `completions` | `NodeCompletion[]` | Completion nodes requested by `^\|` or explicit positions |

`nodes` is the single source of node data. The categorized getters derive their values from `nodes` each time they are read.

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('let answer = 42\n//  ^?\nmain() { println(answer) }\n')
const query = result.queries[0]

if (query) {
  console.log(query.text)
  console.log(result.code.slice(query.start, query.start + query.length))
}
```

The second log prints the query target, `answer`.

## Information nodes

Nodes are discriminated by `type`. Position fields retain the upstream shape:

| Common field | Meaning |
| --- | --- |
| `type` | `hover`, `query`, `error`, `highlight`, `tag`, or `completion` |
| `start` | Zero-based starting offset in the output source |
| `length` | Range length; may be zero |
| `line` | Zero-based starting line |
| `character` | Zero-based starting column |

Common type-specific fields:

| Node | Fields |
| --- | --- |
| `hover`, `query` | `target` is the source text, `text` is the signature, and `docs` may be present |
| `error` | `text` is the message; `code`, `level`, `filename`, and `id` may be present |
| `highlight` | May include an annotation `text` |
| `tag` | `name` is the tag name; `text` is optional content |
| `completion` | `completions` is `{ name, kind? }[]`, `completionsPrefix` is the typed prefix, and `length` is `0` |

Narrow the union through `node.type` before reading type-specific fields. `NodeHover`, `NodeQuery`, and other node types come directly from `twoslash-protocol`; there is no separate Cangjie node format.

## Coordinates and cropping

`start`, `length`, `character`, and explicit position options use UTF-16 code units, rather than bytes or visual character widths. JavaScript string indexing and `slice()` use the same unit; an emoji can occupy two code units.

| Data | Coordinate base |
| --- | --- |
| `result.nodes` and categorized getters | Final `result.code` |
| `result.meta.removals` | Original input |
| `result.meta.positionQueries` | Original input |
| `result.meta.positionCompletions` | Original input |
| `result.meta.positionHighlights` | Original input |
| `CjslashError.diagnostics` | Original input of the failed analysis |

Node intervals are `[start, start + length)`. Removal and highlight ranges are `[start, end)`, with the right endpoint excluded.

By default, positions are recalculated after annotations and hidden source are removed. With `keepNotations`, `result.code` stays identical to the input, and nodes use input positions. `meta.removals` still records the ranges that would otherwise be removed.

## Metadata

| `CjslashResultMeta` field | Meaning |
| --- | --- |
| `extension` | Always `cj` |
| `handbookOptions` | Fully resolved defaults, API options, and source annotations |
| `removals` | Ranges to remove from the original input |
| `positionQueries` | Explicit query offsets in the original input |
| `positionCompletions` | Completion cursor offsets in the original input |
| `positionHighlights` | Original-input highlights as `[start, end, text?]` |

Metadata connects author input to final presentation. When using Shiki, still pass the original source; the transformer reads the prepared result.

In multi-file examples, node offsets and line numbers still refer to the complete code block. They do not reset at file boundaries. Diagnostic `filename` fields identify the virtual source file and remain unchanged by cropping.

## Protocol utilities

`@cjslash/protocol` directly exports upstream `Position`, `Range`, `TwoslashNode`, `NodeWithoutPosition`, and node types, alongside these utilities:

`createPositionConverter`, `splitLines`, `isInRange`, `isInRanges`, `mergeRanges`, `removeCodeRanges`, `resolveNodePositions`.

These utilities retain their upstream semantics. For example, `isInRange` includes both endpoints by default, so its default behavior differs from the half-open ranges described above.

## Serialization

To store or transfer a result, use `code`, `extension`, `nodes`, and `meta` as data. JSON parsing does not restore getters. Derive dynamic categorized views from the restored `nodes` using `node.type` if needed. The core API does not expose a separate cache-restoration factory.
