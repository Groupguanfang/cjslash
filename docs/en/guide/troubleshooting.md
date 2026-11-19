---
description: Troubleshoot static highlighting, SDK configuration, queries, unexpected diagnostics, and popup styles.
---

# Troubleshooting

## Syntax colors appear, but there are no type hovers

Check that `sdkPath`, `CJSLASH_SDK_PATH`, or `CANGJIE_HOME` is configured. Without an SDK, the VitePress plugin still registers static syntax highlighting.

Then check that the fence language is `cj`, `cangjie`, or `Cangjie`, and that its metadata contains `cjslash`. Regular `cj` fences are not analyzed by default.

For custom tags, check `cjslashOptions.customTags`. If `noStaticSemanticInfo` is enabled, automatic hovers are disabled, but explicit `^?` queries remain available.

## The SDK cannot be found or started

`sdkPath` must point to the root containing both `bin/cjc` and `tools/bin/LSPServer`, rather than the `bin` directory itself. Check that the SDK matches the current platform and architecture and that its binaries are executable.

Run the compiler directly to check the installation:

```bash
/path/to/cangjie/bin/cjc -v
```

`SDK_NOT_FOUND` means the path or required executables are unavailable. `SDK_INVALID` means compiler validation failed. See [Error types](../refs/api#errors) for LSP startup, exit, and timeout errors.

## `AsyncDisposableStack is not defined`

The runtime lacks the resource-management APIs used by the core. Switch to a runtime providing `AsyncDisposableStack` and `Symbol.asyncDispose`, and make sure the documentation build actually uses that runtime.

Replacing `await using` with an explicit `[Symbol.asyncDispose]()` call only changes the caller's syntax. The core still needs `AsyncDisposableStack` internally.

## `INVALID_QUERY`

Place `^` on a queryable symbol on the preceding line. Align it with spaces, and check that it does not point to a blank line, hidden source, or past the end of the line. Core positions use UTF-16 units rather than visual character widths.

```cj
let answer = 42
//  ^?
main() { println(answer) }
```

The error also occurs if the SDK does not return hover information at that position. Check that the program is complete, or move the query to the variable declaration.

## `UNEXPECTED_DIAGNOSTIC`

By default, diagnostics not allowed by `handbookOptions.errors` or `@errors` fail analysis. Diagnostics can include warnings. Use the codes actually returned by the SDK.

Allow the intended diagnostic in a teaching example:

```cj
// @errors: 731
main() {
    let value: Int64 = "bad"
    println(value)
}
```

`@noErrorValidation` keeps diagnostics and skips validation; `@noErrors` suppresses diagnostics. Prefer `@errors` when possible so other unexpected diagnostics are still detected. See [Diagnostic annotations](../refs/notations#diagnostics).

## Package declarations or paths are incorrect

Place `package example.models` at the top of the source, before Cjslash annotations and declarations. The plugin creates the current example's temporary directory from its package name; examples do not need to use `default`.

Blocks are isolated. Types and packages from a previous block do not automatically exist in the next one. Put shared setup into each complete example and hide it with cutting annotations.

## `source has not been prepared`

When calling Shiki directly, first `await transformer.prepare(source)`, then pass the same original source to the highlighter. A trailing newline alone is enough to produce a different cache key.

With VitePress, check that `vitePluginCjslash()` is in `vite.plugins`, and whether the code comes from `@include` or `<<<`. These are expanded later and need separate preparation; see [Preparation boundaries](./vitepress#preparation).

## Popup text is hard to read in light mode

Check that the popup background matches your light and dark Shiki themes. If both appearance modes use a dark code theme, identical `--shiki-light` and `--shiki-dark` token values are expected.

Adjust `--twoslash-popup-bg`, `--twoslash-popup-color`, and `--twoslash-border-color` in the site theme, or select a code theme suited to light mode. This documentation's Monokai overrides belong to its site theme; see [Styles and themes](./vitepress#styling).

## Builds are slow or time out

Each source analyzed for the first time starts an isolated LSP session. Calls on the same analyzer run sequentially. The transformer reuses successful results for identical original source but does not provide a persistent disk cache.

Increase the plugin or analyzer `timeout` in slower environments; its default is `30_000` milliseconds. You can also set `noStaticSemanticInfo: true` to retain only explicit queries and reduce automatic hover requests.
