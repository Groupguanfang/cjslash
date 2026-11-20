---
description: Interface reuse, asynchronous analysis, and supported features when adapting Twoslash examples.
---

# Twoslash compatibility

Cjslash keeps the Twoslash annotations and data shapes that fit Cangjie, while using the Cangjie SDK for semantic information. Authors familiar with Twoslash can continue to use queries, cuts, and diagnostic annotations with the Cangjie analyzer and its asynchronous preparation step.

## Package mapping

| Twoslash ecosystem | Cjslash ecosystem | Responsibility |
| --- | --- | --- |
| `twoslash-protocol` | `@cjslash/protocol` | Nodes, positions, and result protocol |
| `twoslash` | `@cjslash/core` | Source analysis and structured results |
| `@shikijs/twoslash` | `@cjslash/shiki` | Render analysis results as highlighted HTML |
| `@shikijs/vitepress-twoslash` | `@cjslash/vitepress` | VitePress integration and popup client |

Applicable upstream node types, renderer interfaces, and utilities are re-exported directly. Interfaces that need more information extend upstream shapes. Cangjie-specific interfaces replace shapes that do not fit.

## Analyzer API

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('main() {}', 'cj')
```

`createCjslasher()` returns a promise. The instance analyzes source through `analyze()` and releases resources through `[Symbol.asyncDispose]()`. It does not return a synchronous callable function or expose upstream TypeScript language-service cache APIs.

Each analysis uses its own project and LSP session. Calls on one instance are serialized. If you need parallel analysis, create multiple instances and manage their lifecycles separately.

## Supported annotations

| Annotation | Support |
| --- | --- |
| `^?` | Query the type at the corresponding position on the preceding line |
| `^\|` | Request completions at the cursor and filter by identifier prefix |
| `@filename` | Analyze files in one root module, including cross-file queries and imports |
| Consecutive `^^` | Highlight a range, optionally with a message |
| `---cut---`, `---cut-before---`, `---cut-after---` | Hide source before or after a marker |
| `---cut-start---`, `---cut-end---` | Hide a source section between paired markers |
| `@errors`, `@noErrors`, `@noErrorValidation` | Control diagnostic validation and output |
| `@noErrorsCutted` | Ignore diagnostics in hidden source |
| `@noStaticSemanticInfo`, `@keepNotations` | Control automatic hovers and annotation preservation |
| Registered `@tag` | Extract custom annotation tags |

Cangjie diagnostic codes can be numbers or strings. Use SDK diagnostic codes in `@errors`; TypeScript codes cannot be copied directly into Cangjie examples.

## Current boundaries

The analyzer accepts single-file `.cj` examples and multiple files in the same root module. These annotations report `UNSUPPORTED_FEATURE`:

- Emitted output such as `@showEmit` and `@showEmittedFile`.
- TypeScript compiler annotations such as `@target` and `@lib`.

Completions reuse upstream `NodeCompletion`, `CompletionEntry`, and renderers. Completion queries require SDK completion support; SDKs without it can still analyze ordinary examples. `@filename` files must share one root module, with directories matching their `package` declarations. See [multiple files](../refs/notations#files).

Emitted output needs a separate compilation workflow and is not implemented. TypeScript compiler options do not apply to Cangjie; configure SDK projects through `cjpmToml` and [field override annotations](../refs/notations#overriding-options) such as `@package.version` and `@dependencies.<name>`.

## Highlighting differences

With `@cjslash/shiki`, wait for `transformer.prepare(source)` before synchronously rendering the same original source. The `vitePluginCjslash()` integration in `@cjslash/vitepress` prepares Markdown automatically.

The Shiki transformer processes supported languages by default; the VitePress plugin requires `cjslash` fence metadata by default. Both accept `explicitTrigger` and recognize `nocjslash` and `no-cjslash` as disabling metadata.

`twoslasher`, `twoslashOptions`, `typesCache`, and `includesMap` are not Cangjie transformer options. Use `cjslasher` and `cjslashOptions`, and organize multiple files with `@filename`.

## Upstream reading

This documentation follows the Twoslash [introduction](https://twoslash.netlify.app/guide/) and [notation reference](https://twoslash.netlify.app/refs/notations). Presentation interfaces come from Shiki's [Twoslash integration](https://shiki.style/packages/twoslash) and [VitePress integration](https://shiki.style/packages/vitepress). For Cangjie support, use this project's APIs and documentation as the reference.
