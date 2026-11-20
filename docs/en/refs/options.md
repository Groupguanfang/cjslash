---
outline: deep
description: Analyzer configuration, execution options, handbook controls, and highlighting integration options.
---

# Options

## Analyzer options {#analyzer-options}

`createCjslasher(options)` accepts `CjslashOptions`. It also accepts the execution defaults described below, excluding an instance-level `signal`.

| Option | Type | Default and behavior |
| --- | --- | --- |
| `sdkPath` | `string` | Required SDK root |
| `workspaceRoot` | `string` | Parent directory for generated projects; defaults to the system temporary directory |
| `platform` | `NodeJS.Platform` | `process.platform`; locates SDK executables and runtime libraries |
| `arch` | `NodeJS.Architecture` | `process.arch`; locates runtime libraries |
| `timeout` | `number` | `30_000`; maximum initialization or per-analysis time in milliseconds |
| `cjpmToml` | `CjpmToml` | A serializable JavaScript object merged into the temporary project manifest |
| `autoInstallDependencies` | `boolean` | `true`; automatically download uncached dependencies declared in configuration or source annotations |

`timeout` must be an integer between `1` and `2_147_483_647`. Invalid values throw `RangeError`.

### Temporary project configuration

Use `workspaceRoot` to choose the parent directory for generated projects. Relative paths are resolved against the current working directory when the analyzer is created, and missing directories are created automatically. Each analysis uses a unique `cjslash-<random>/<root-module>/` child directory. Analysis completion or initialization failure removes only that generated child directory, preserving the parent and other files.

`cjpmToml` accepts a serializable JavaScript object. It is merged with the defaults, then serialized with `confbox`'s `stringifyTOML` and written to the temporary project's `cjpm.toml`:

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  workspaceRoot: './.cjslash',
  cjpmToml: {
    package: {
      'version': '0.2.0',
      'output-type': 'static',
      'src-dir': 'src',
    },
  },
})
```

The generated package version defaults to `0.1.0`, and `cjc-version` comes from the SDK. `package.name` always follows the root module from the source's package declaration. `package.src-dir` defaults to `src` and can be overridden with a relative directory inside the project; absolute paths and `..` segments are rejected.

`CjpmToml`, `CjpmTomlSection`, and `CjpmTomlValue` are exported from `@cjslash/core` for typing configuration objects. TOML strings are not accepted. Invalid object structures or serialization failures throw `INVALID_CJPM_TOML`.

Extra configuration does not turn other Markdown blocks into files in this project. Use [`@filename`](./notations#files) for multiple files in one block; separate blocks still use isolated projects.

Pass `cjpmToml` to an individual `analyze()` call or override fields through [source annotations such as `@package.version` and `@dependencies.<name>`](./notations#overriding-options). Precedence runs from manifest defaults through instance options, per-call options, then source annotations. Tables merge recursively, arrays replace previous arrays, and overrides apply only to the current block.

### Dependency installation and caching

`autoInstallDependencies` defaults to `true`. Local `path` dependencies are read directly from source. Uncached Git and registry dependencies are downloaded through the SDK's `cjpm update --skip-script`. CJPM's standard output and error streams appear directly in the current terminal.

The cache lives at `workspaceRoot/cjslash-cache/`, or under the system temporary directory when `workspaceRoot` is omitted. Cache identities include the SDK, dependency name, version or Git specification, and repository settings. Successful resolutions and downloads are reused across code blocks and analyzer instances; only uncached dependencies are downloaded, and duplicate pending installations share a request. The cache survives individual project cleanup.

Set `autoInstallDependencies: false` to disable automatic downloads while retaining access to local and cached modules. Installation failures warn without exiting the host process and are not recorded as successful, so later analyses can retry. Unresolved imports still follow normal diagnostic handling; use `@noErrorValidation` to retain those diagnostics during development previews.

## Execution options {#execute-options}

`analyze(code, 'cj', options)` accepts `CjslashExecuteOptions`:

| Option | Type | Behavior |
| --- | --- | --- |
| `handbookOptions` | `Partial<CjslashHandbookOptions>` | Override diagnostic and annotation handling |
| `cjpmToml` | `CjpmToml` | Recursively merge with instance project settings before source annotations |
| `customTags` | `string[]` | Register `@tag` names to extract |
| `positionQueries` | `number[]` | Query offsets in the original source |
| `positionCompletions` | `number[]` | Completion cursor offsets in the original source, including the end of a file |
| `positionHighlights` | `[number, number, string?][]` | Original-source highlights as `[start, end, text?]` |
| `signal` | `AbortSignal` | Cancel this analysis |
| `shouldGetHoverInfo` | `(identifier, start, filename) => boolean` | Filter automatic hover requests without affecting explicit queries |
| `filterNode` | `(node: NodeWithoutPosition) => boolean` | Filter nodes before validation and cropping |

Positions use UTF-16 code units across the complete original input. `filename` is the normalized relative name declared by `@filename`, defaulting to `index.cj`. Explicit positions can be combined with query, completion, and highlight annotations in the source.

## Handbook options {#handbook-options}

`CjslashHandbookOptions` controls how an example is validated and displayed:

| Field | Default | Behavior |
| --- | --- | --- |
| `errors` | `[]` | Allowed diagnostic codes, as numbers or strings |
| `noErrors` | `false` | `true` suppresses all diagnostics; an array suppresses the listed codes |
| `noErrorValidation` | `false` | Keep diagnostics without checking allowed codes |
| `noStaticSemanticInfo` | `false` | Disable automatic hovers while retaining explicit queries and completions |
| `keepNotations` | `false` | Preserve original source and annotations |
| `noErrorsCutted` | `false` | Ignore diagnostics starting inside hidden ranges |

For example, disable automatic hovers by default and restore them for one analysis:

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  handbookOptions: { noStaticSemanticInfo: true },
})

const result = await cjslasher.analyze('main() {}', 'cj', {
  handbookOptions: { noStaticSemanticInfo: false },
})
```

Precedence, from lowest to highest, is built-in defaults, instance options, per-call options, then source annotations. `handbookOptions` merge field by field; overriding an array replaces that field's complete array. See [Notations](./notations) for source annotations such as `@errors`.

## Shiki transformer options {#shiki-options}

`TransformerCjslashOptions` from `@cjslash/shiki` extends the applicable `TransformerTwoslashOptions`:

| Field | Default and behavior |
| --- | --- |
| `cjslasher` | Required borrowed `Cjslash['analyze']` function |
| `cjslashOptions` | Fixed execution options for every preparation |
| `langs` | `['cj']` |
| `langAlias` | Maps `cangjie` and `Cangjie` to `cj` |
| `explicitTrigger` | No trigger required by default; `true` requires `cjslash`; also accepts a regular expression |
| `disableTriggers` | `['nocjslash', 'no-cjslash']` |
| `rendererRich` | Upstream rich renderer options; Cangjie signatures are preserved by default |
| `renderer` | An upstream custom renderer |
| `filter` | Evaluated with the full Shiki options and context |
| `throws`, `onTwoslashError`, `onShikiError` | Upstream synchronous rendering error handling |

The caller handles asynchronous `prepare()` failures. Synchronous rendering callbacks do not catch them.

## VitePress plugin options {#vitepress-options}

`VitePluginCjslashOptions` reuses analyzer SDK settings and the lower-level transformer's rendering options:

| Field | Default and behavior |
| --- | --- |
| `sdkPath` | Optional; takes precedence over `CJSLASH_SDK_PATH` and `CANGJIE_HOME` |
| `platform`, `arch`, `workspaceRoot`, `cjpmToml`, `autoInstallDependencies`, `timeout` | Used when creating the owned analyzer |
| `cjslasher` | Optional borrowed analysis function; its owner disposes it |
| `injectClient` | `true`; inject the client and styles automatically |
| `allowUnprepared` | `true`; unprepared renders use static highlighting |
| `cjslashOptions` | Execution options shared by all code blocks |
| `explicitTrigger` | Requires `cjslash` by default; accepts `false` or a regular expression |
| `disableTriggers`, `langs`, `langAlias` | Same defaults as the Shiki integration |
| `errorRendering`, `floatingVue`, `renderer` | Upstream VitePress rendering settings |
| `processHoverInfo` | Preserves Cangjie signatures by default |
| `filter`, `throws`, `onTwoslashError`, `onShikiError` | Upstream filtering and error handling |

The lower-level `VitePressPluginCjslashOptions` requires `cjslasher` and defaults `allowUnprepared` to `false`. The plugin overload accepting an existing transformer does not install the client automatically.

TypeScript `compilerOptions`, synchronous `twoslasher`, `twoslashOptions`, `typesCache`, and `includesMap` are not provided. See [Twoslash compatibility](../guide/compatibility).
