---
description: An introduction to type hovers, explicit queries, and compiler diagnostics in Cangjie documentation.
---

# Introduction

Cjslash adds compiler-provided type information to Cangjie code examples. Authors write complete `.cj` examples; Cjslash calls the language server from a local Cangjie SDK, collects signatures and diagnostics, and passes the results to Shiki or VitePress.

Readers can hover over symbols, inspect explicit `^?` queries, and see real compiler diagnostics in examples that demonstrate errors. Analysis runs during documentation development or builds. The browser displays the results without running the Cangjie SDK.

## From source code to type information

A regular code block displays the source:

```cj
let answer = 42
main() { println(answer) }
```

Add `cjslash` to the fence metadata and place `^?` below the symbol to query:

````md
```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```
````

With SDK analysis enabled, the result becomes interactive:

```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```

Align `^` with the target symbol on the preceding line. The annotation is removed from the displayed code, and the SDK supplies the type information. In this example, `answer` is inferred as `Int64`.

## Explain errors with real diagnostics

Use `@errors` to allow specific diagnostic codes while keeping validation enabled:

```cj cjslash
// @errors: 776
main() {
    let answer = 42
    answer = 43
    println(answer)
}
```

A variable declared with `let` cannot be reassigned. Here, `776` is the diagnostic code returned by Cangjie SDK 1.2.1 for `answer = 43`, with the message `cannot assign to immutable value`. Messages and codes can change between SDK versions; use the values returned by your SDK when writing examples.

Unexpected diagnostics fail analysis by default, helping authors catch mistakes. See [Notations](../refs/notations) for the complete rules.

## Choose an integration

| Goal | Package | Entry point |
| --- | --- | --- |
| Interactive code blocks in VitePress | `@cjslash/vitepress` | [`vitePluginCjslash()`](./vitepress) |
| Highlighted HTML in a custom rendering pipeline | `@cjslash/shiki` | [`transformerCjslash()`](./highlight) |
| Analyze source and handle the results yourself | `@cjslash/core` | [`createCjslasher()`](./install) |
| Use node, position, and result types | `@cjslash/protocol` | [Protocol and results](../refs/result) |

VitePress users can start with the [VitePress integration](./vitepress) and add `vitePluginCjslash()` to their Vite configuration.

## Relationship to Twoslash

Cjslash follows the annotation syntax and result protocol of [Twoslash](https://twoslash.netlify.app/guide/), reusing upstream highlighting and popup implementations where possible. This documentation follows the same guide, integration, and reference structure.

The analyzer uses the Cangjie LSP and exposes asynchronous APIs. It supports type queries, `^|` completions, and `@filename` examples with several files in one module. Emitted output is not implemented. See [Twoslash compatibility](./compatibility) when adapting existing examples.
