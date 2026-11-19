---
outline: deep
description: Type queries, completions, multiple files, highlights, cuts, diagnostic controls, and custom tags for Cangjie examples.
---

# Notations

Write annotations in standalone `//` comments. Matching text inside strings or block comments is not parsed. Annotations are normally removed from the displayed source.

If the example declares a `package`, put it at the top of the file before annotations. The complete source participates in SDK analysis; cropping happens after semantic information has been collected.

Switch between the **Rendered** and **Input Code** tabs below. Input Code preserves every annotation and hidden section so you can inspect the complete example.

## Type queries {#queries}

Place `^?` below a symbol on the preceding line. The column occupied by `^` determines the query position:

```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```

Explicit queries produce `query` nodes. Automatic information for ordinary symbols produces `hover` nodes. Disabling automatic hovers does not disable explicit queries.

## Completions {#completions}

Align `^|` with the cursor on the preceding line, immediately after the prefix already typed:

```cj cjslash
// @noErrors
main() {
    let message = "hello"
    message.c
//           ^|
}
```

The analyzer requests Cangjie LSP completions, filters by the identifier prefix, and produces upstream `NodeCompletion` nodes. After a character such as `.`, it retains the returned candidates. `@noErrors` suppresses diagnostics caused by the incomplete expression.

An empty response normally reports `INVALID_COMPLETION`; `@noErrorValidation` preserves an empty completion node instead. Disabling automatic hovers does not disable completions. You can also pass cursor offsets through `positionCompletions`, including the end of a file.

Candidates depend on how the SDK parses the source. Preserve complete function and package context where possible. For example, an unclosed function can prevent member completion; suppressing diagnostics does not repair that syntax context.

## Multiple files {#files}

`@filename` starts a virtual file. Files in the same code block share a temporary project and LSP, allowing declarations and imports to resolve across files:

```cj cjslash
// @filename: models/data.cj
package example.models
public let answer = 42
// @filename: main.cj
package example
import example.models.*
main() { println(answer) }
//               ^?
```

Put each file's `package` declaration at the top of that file. These files are written to `src/models/data.cj` and `src/main.cj`. A bare `data.cj` filename also works: its directory follows `package example.models`. If a directory is supplied, it must match the package path after the root module.

Names must be relative `.cj` paths without `..`. Duplicate filenames and paths mapping to the same source file are rejected. All files must share a root module; files without a package declaration use `default`. Source before the first `@filename` belongs to an implicit `index.cj`; leading comments and whitespace alone do not create an extra file.

`@filename` lines remain visible as separators. Cuts can hide an entire file while keeping it in analysis. Nodes use coordinates across the complete displayed block; diagnostic `filename` fields and `shouldGetHoverInfo` callbacks identify the corresponding virtual file.

## Range highlights {#highlights}

Use two or more consecutive `^` characters to mark a range on the preceding line. An optional message follows a space:

```cj cjslash
let answer = 42
//  ^^^^^^ important
main() { println(answer) }
```

The range starts at the first `^` column and has the same length as the run of `^` characters. The renderer determines styling and whether the message is displayed.

## Cut source code {#cutting}

Examples need to be complete, but readers may not need to see all their setup. Cutting annotations hide source while keeping visible semantic information collected from the complete program.

### Hide preceding source

`// ---cut---` is shorthand for `// ---cut-before---`. It hides the marker and everything before it:

```cj cjslash
package example.models

let answer = 42
// ---cut---
main() { println(answer) }
```

The visible reference to `answer` still has type information because its declaration participated in analysis.

### Hide following source

`// ---cut-after---` hides the marker and everything after it:

```cj cjslash
let answer = 42
// ---cut-after---
main() { println(answer) }
```

### Hide an intermediate section

`// ---cut-start---` and `// ---cut-end---` hide the source between them, including both marker lines. These markers must be paired:

```cj cjslash
let answer = 42
// ---cut-start---
let hidden = 0
// ---cut-end---
main() { println(answer + hidden) }
```

Node positions are recalculated against `result.code`. Original removal ranges remain in `result.meta.removals`; see [Results](./result).

## Diagnostic annotations {#diagnostics}

### `@errors`

Allow the listed Cangjie diagnostic codes, separated by spaces. Allowed diagnostics remain visible; other diagnostics fail analysis by default:

```cj cjslash
// @errors: 731
main() {
    let value: Int64 = "bad"
    println(value)
}
```

The list allows codes to occur; it does not require every listed code to occur. Numeric and string codes are supported. Actual codes depend on the SDK.

### `@noErrors`

`// @noErrors` or `// @noErrors: true` suppresses all diagnostics. `// @noErrors: 731` suppresses only the listed codes. Suppressed diagnostics are excluded from both the result and validation.

`// @noErrors: false` disables suppression.

### `@noErrorValidation`

Keep diagnostics while skipping the allowed-code check:

```cj cjslash
// @noErrorValidation
main() {
    let value: Int64 = "bad"
    println(value)
}
```

Use this to inspect SDK diagnostics before choosing the appropriate `@errors` codes.

### `@noErrorsCutted`

Ignore diagnostics whose starting position is inside a hidden range. Otherwise, hidden source must pass diagnostic validation too:

```cj cjslash
// @noErrorsCutted
let hidden: Int64 = "bad"
// ---cut---
let answer = 42
//  ^?
main() { println(answer) }
```

## Overriding project options {#overriding-options}

Use Twoslash-style `// @option: value` annotations to override `cjpm.toml` fields. Field paths use TOML dotted keys, and values use TOML syntax: quote strings, or provide numbers, booleans, arrays, and inline tables. Omitting the value means `true`.

```cj cjslash
package example
// @package.version: "0.2.0"
// @package.src-dir: "examples"
// @profile.build.incremental
let answer = 42
//  ^?
main() { println(answer) }
```

These annotations are removed from displayed source and merged recursively with the API's `cjpmToml` configuration. Source annotations take precedence, the last assignment to a field wins, and arrays replace previous arrays. Settings apply to all files in the current block without affecting other blocks. `package.name` still follows the source's root package declaration.

Declare dependencies directly in annotations as well:

```cj
package example
// @dependencies.utility: { git = "https://example.com/utility.git", tag = "v1.0.0" }
// @dependencies.local: { path = "./libraries/local" }
// @dependencies."org::library": "1.0.0"
import utility.*
main() {}
```

Local dependency paths are relative to the calling process's current working directory. Uncached remote dependencies are installed automatically unless the analyzer is created with `autoInstallDependencies: false`; source annotations cannot change this switch. Installation progress streams to the terminal, and failures never exit the host process. See [dependency installation and caching](./options#dependency-installation-and-caching).

## Other analysis annotations

| Annotation | Behavior |
| --- | --- |
| `// @noStaticSemanticInfo` | Disable automatic hovers while keeping explicit `^?` queries |
| `// @keepNotations` | Preserve original source and annotations, with nodes positioned against the input |

These two annotations, along with `@noErrorValidation` and `@noErrorsCutted`, accept explicit `: true` or `: false` values. Source annotations override API options and apply to the complete example.

## Custom tags {#tags}

Register names in execution options first:

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { defineConfig } from 'vitepress'

export default defineConfig({
  vite: {
    plugins: [
      vitePluginCjslash({
        cjslashOptions: {
          customTags: ['warn', 'error', 'log', 'annotate'],
        },
      }),
    ],
  },
})
```

You can then extract matching comments:

```cj cjslash
// @warn: Read the inferred type below.
let answer = 42
main() { println(answer) }
```

Tags produce `tag` nodes, with presentation determined by the renderer. An unregistered `@name` reports an unsupported annotation rather than being ignored as an ordinary comment. Choose custom names that do not conflict with built-in options.

## Not implemented yet {#unsupported}

Emitted output through `@showEmit` and `@showEmittedFile` is not implemented. TypeScript compiler annotations do not apply to Cangjie. These annotations report `UNSUPPORTED_FEATURE`; see [Twoslash compatibility](../guide/compatibility). Automatically creating several root modules in one example is also not supported.
