---
outline: deep
description: Public APIs for the analyzer, error types, and Shiki and VitePress integrations.
---

# API reference

## `createCjslasher(options)`

Exported from `cjslash`. Accepts [`CjslashOptions`](./options#analyzer-options) and returns `Promise<Cjslash>`:

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const result = await cjslasher.analyze('main() {}')
```

Creation validates the SDK and resolves its path and any configured `workspaceRoot` to absolute paths. A temporary project and LSP session are created and cleaned up for each analysis; the parent directory specified by `workspaceRoot` is retained.

### `cjslasher.options`

Read-only creation options, including `sdkPath` and any configured `workspaceRoot` resolved to absolute paths.

### `cjslasher.analyze(code, extension?, options?)`

Returns `Promise<CjslashResult>`:

| Parameter | Type | Description |
| --- | --- | --- |
| `code` | `string` | Complete original source; `@filename` can separate files in one module |
| `extension` | `'cj'` | Optional; defaults to `cj` |
| `options` | `CjslashExecuteOptions` | Overrides for this analysis |

Calls on one instance run sequentially. Creation-time execution settings act as defaults. Per-call options override them, `handbookOptions` merge field by field, and source annotations override the corresponding settings.

### `cjslasher[Symbol.asyncDispose]()`

Returns `Promise<void>`, cancels running and queued work, and waits for cleanup. Call it directly or let `await using` invoke it. Repeated calls share the same promise. Analysis on a disposed instance reports `DISPOSED`.

## Cancel one analysis

Per-call execution options accept an `AbortSignal`:

```ts twoslash
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const abortController = new AbortController()
const pending = cjslasher.analyze('main() {}', 'cj', {
  signal: abortController.signal,
})

abortController.abort()
await pending.catch((error: unknown): void => {
  console.error(error)
})
```

Cancellation does not dispose the analyzer; later calls can still run. The rejection uses the signal's reason and is not necessarily a `CjslashError`.

## `CjslashError` {#errors}

Exported from `cjslash`. Extends `Error` with a stable `code`, optional `cause`, and optional `diagnostics`. Unexpected diagnostic nodes use **original input coordinates**, so authors can locate them in the source.

```ts twoslash
import { CjslashError, createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })

try {
  await cjslasher.analyze('main() { let value: Int64 = "bad"; println(value) }')
}
catch (error) {
  if (error instanceof CjslashError) {
    console.error(error.code, error.diagnostics)
  }
  else {
    throw error
  }
}
```

| `CjslashErrorCode` | Meaning |
| --- | --- |
| `SDK_NOT_FOUND` | The SDK path or required executables are unavailable |
| `SDK_INVALID` | Compiler execution or version validation failed |
| `LSP_START_FAILED` | The LSP process could not start |
| `LSP_EXITED` | The LSP exited unexpectedly |
| `LSP_TIMEOUT` | LSP initialization or analysis timed out |
| `INVALID_NOTATION` | Invalid annotation syntax, pairing, or range |
| `INVALID_CJPM_TOML` | The `cjpmToml` object has an invalid structure or could not be serialized as TOML |
| `UNSUPPORTED_FEATURE` | An unsupported extension or annotation |
| `INVALID_QUERY` | An invalid query position or no SDK type information at that position |
| `INVALID_COMPLETION` | An invalid completion cursor or no matching SDK candidates |
| `UNEXPECTED_DIAGNOSTIC` | A diagnostic was not allowed |
| `DISPOSED` | The analyzer has been disposed |

## Shiki API

Exports from `@cjslash/shiki`:

| Export | Purpose |
| --- | --- |
| `transformerCjslash(options)` | Create a `CjslashShikiTransformer` |
| `transformer.prepare(code)` | Analyze and cache original source; returns `Promise<CjslashResult>` |
| `cangjieLanguage` | The Cangjie TextMate grammar bundled with the package |
| `rendererClassic`, `rendererRich` | Upstream renderer factories |
| `ShikiTwoslashError` | The upstream highlighting error type |

`TransformerCjslashOptions` extends applicable upstream options. `CjslashShikiTransformer` extends `ShikiTransformer` with `prepare()`. `HastExtension`, `RendererRichOptions`, and `TwoslashRenderer` are re-exported directly.

See [Shiki highlighting](../guide/highlight) for setup and lifecycle details.

## VitePress API

Exports from `@cjslash/vitepress`:

| Export | Purpose |
| --- | --- |
| `vitePluginCjslash(options?)` | Configure VitePress through one Vite plugin |
| `vitePluginCjslash(transformer)` | Use an existing transformer without automatically installing the client |
| `transformerCjslash(options)` | Create the lower-level `CjslashVitePressTransformer` |
| `transformer.prepare(code)` | Prepare the exact original source |
| `transformer.prepareMarkdown(source)` | Prepare matching Markdown fences; returns `Promise<void>` |
| `rendererFloatingVue` | The upstream FloatingVue renderer |
| `cangjieLanguage`, `ShikiTwoslashError` | The shared grammar and upstream error type |

Types include `VitePluginCjslashOptions`, `VitePressPluginCjslashOptions`, and `CjslashVitePressTransformer`, plus upstream `TwoslashFloatingVueOptions` and `TwoslashFloatingVueRendererOptions`.

For manual client setup, import the default Vue plugin from `@cjslash/vitepress/client` and the `@cjslash/vitepress/style.css` stylesheet. `FloatingVueConfig` is re-exported from the client entry. Automatic integration does not require manual installation; see [VitePress integration](../guide/vitepress).

## Protocol API

`@cjslash/protocol` exports Cangjie result and option types alongside upstream node types and position utilities. `CjslashGenericFunction<Options>` retains the `(code, extension?, options?)` argument shape and returns `Promise<TwoslashGenericResult>`.

See [Results](./result) for node definitions and coordinate conventions.
