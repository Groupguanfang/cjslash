---
description: Prepare the Cangjie SDK, create an analyzer, and manage its asynchronous lifecycle.
---

# Installation & usage

This page covers the core package, which returns structured results. For interactive Markdown blocks, start with the [VitePress integration](./vitepress). For highlighted HTML, see the [Shiki integration](./highlight).

## Prepare the environment

Analysis runs in a local environment that can execute the Cangjie SDK. Your JavaScript runtime must provide `AsyncDisposableStack` and `Symbol.asyncDispose`. Source code using `await using` also needs syntax support or an appropriate transpiler.

Check the required runtime APIs:

```bash
node -p "typeof AsyncDisposableStack"
node -p "typeof Symbol.asyncDispose"
```

The expected outputs are `function` and `symbol`, respectively.

Install a Cangjie SDK matching your operating system and CPU architecture. Set `sdkPath` to the SDK root, containing:

```text
cangjie/
├── bin/cjc
├── tools/bin/LSPServer
└── runtime/lib/
```

On Windows, the executable files have an `.exe` extension. The documentation examples are verified with SDK 1.2.1.

## Install the core package

```bash
pnpm add -D @cjslash/core
```

The core API requires an explicit `sdkPath`. Reading `CJSLASH_SDK_PATH` and `CANGJIE_HOME` automatically is a convenience provided by the VitePress plugin.

## Create an analyzer

```ts twoslash
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
})

const source = 'let answer = 42\n//  ^?\nmain() { println(answer) }\n'
const result = await cjslasher.analyze(source)

console.log(result.code)
console.log(result.queries[0]?.text)
```

`result.code` contains the source after annotation removal and cropping. `result.queries` contains explicit query nodes. The result does not contain highlighted HTML; see [Results](../refs/result) for the data structure.

`createCjslasher()` validates the SDK and returns an asynchronous analyzer. Each `analyze()` call creates its own temporary project and LSP session, then disposes them when analysis finishes. Calls on the same analyzer run sequentially and do not share the previous example's source or package declaration.

## Release resources

`await using` calls `[Symbol.asyncDispose]()` when its scope exits. If you cannot use that syntax, dispose explicitly:

```ts twoslash
import { createCjslasher } from '@cjslash/core'

const cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })

try {
  const result = await cjslasher.analyze('main() {}')
  console.log(result.errors)
}
finally {
  await cjslasher[Symbol.asyncDispose]()
}
```

Disposal cancels running and queued work and waits for cleanup. A disposed instance cannot analyze further examples. Repeated disposal calls share the same cleanup promise.

## Write independent examples

Each example should include its complete Cangjie analysis context. Use [`@filename`](../refs/notations#files) for several files in one root module and [cutting annotations](../refs/notations#cutting) to hide setup. Hidden source still participates in analysis.

Place any `package` declaration at the top of the source:

```cj cjslash
package example.models.user

let answer = 42
//  ^?
main() { println(answer) }
```

This creates a temporary project with the root module `example` and writes the source to `src/models/user/index.cj`. A single-segment package uses `src/index.cj`; examples without a declaration use the `default` package. This mapping belongs to the current example and does not import files from other code blocks.

## Work on this repository

Tasks are defined in the root `vite.config.ts`:

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:build
```

Both tasks build the required workspace packages first. You can also set `CANGJIE_HOME`. Without an SDK path, the documentation still builds, but Cangjie blocks use static highlighting only.
