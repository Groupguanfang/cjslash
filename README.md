# Cjslash

Twoslash-style type-aware code examples for Cangjie, with Shiki and VitePress integrations.

[English documentation](docs/en/guide/index.md) · [中文文档](docs/guide/index.md) · [简体中文](#简体中文) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

Cjslash asks the Cangjie SDK for types, completions, and diagnostics, then brings those results into your documentation. It reuses the Twoslash protocol and Shiki renderers where their interfaces fit Cangjie.

## Features

- Type hovers and explicit `^?` queries.
- Completion queries with `^|`, including prefix filtering.
- Compiler diagnostics and expected-error annotations.
- Cutting markers, highlighted ranges, and custom annotation tags.
- Multiple virtual files in the same root module with `@filename`.
- Per-example `cjpm.toml` overrides and dependency caching.
- Shiki highlighting and a single-function VitePress integration.
- Cangjie Cjslash and TypeScript Twoslash blocks on the same page.

Analysis runs asynchronously. Each example gets its own project and LSP session, with automatic cleanup after analysis. The same analyzer processes its calls sequentially.

## Packages

| Package | Purpose |
| --- | --- |
| [`cjslash`](packages/cjslash) | SDK-backed analysis and structured results |
| [`@cjslash/protocol`](packages/cjslash-protocol) | Shared types, reusing compatible Twoslash shapes |
| [`@cjslash/shiki`](packages/cjslash-shiki) | Cangjie grammar and Shiki transformer |
| [`@cjslash/vitepress`](packages/cjslash-vitepress) | VitePress plugin, popup client, and styles |

The project is preparing for its first release. To try the current implementation before packages are published, run the documentation from this workspace.

## VitePress

Install the integration in your VitePress project once packages are published:

```bash
pnpm add -D @cjslash/vitepress shiki
```

Add one plugin in `.vitepress/config.ts`:

```ts
import { vitePluginCjslash } from '@cjslash/vitepress'
import { defineConfig } from 'vitepress'

export default defineConfig({
  vite: {
    plugins: [
      vitePluginCjslash({ sdkPath: '/path/to/cangjie' }),
    ],
  },
})
```

The plugin registers the grammar, prepares examples, installs the popup client and styles, and manages the analyzer lifecycle.

Write annotated Cangjie fences:

````md
```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```
````

You can also call `vitePluginCjslash()` without arguments and provide `CJSLASH_SDK_PATH` or `CANGJIE_HOME` through your environment. Without an SDK, Cangjie blocks use static highlighting.

See the [VitePress guide](docs/en/guide/vitepress.md) for configuration and coexistence with TypeScript Twoslash.

## Core API

```ts
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
})

const result = await cjslasher.analyze(`
let answer = 42
//  ^?
main() { println(answer) }
`)

console.log(result.queries[0]?.text)
```

The runtime must provide `AsyncDisposableStack` and `Symbol.asyncDispose`. The core API requires an explicit SDK path; the VitePress plugin additionally supports environment-based configuration.

Examples are verified against Cangjie SDK 1.2.1. The SDK is installed separately and is not included in Cjslash packages.

See [installation](docs/en/guide/install.md), [Shiki integration](docs/en/guide/highlight.md), [annotations](docs/en/refs/notations.md), and [API reference](docs/en/refs/api.md).

## Develop locally

Use Node.js 24.11 or later in the 24.x line, or Node.js 26 or later, and the pnpm version declared in `package.json`.

After cloning this repository:

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm exec vp run setup
pnpm exec vp run check
pnpm exec vp run test
```

With `vp` available in your shell, start the documentation with a local SDK:

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
```

All workspace tasks live in `vite.config.ts`; package manifests intentionally have no `scripts` field. Files under `externals/` are upstream submodules and must remain unchanged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for SDK tests, builds, commit conventions, and changesets.

## License

Cjslash's own code is released under the [MIT License](LICENSE). Third-party dependencies and submodules retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

## 简体中文

Cjslash 为仓颉文档中的代码示例提供类型感知能力，使用仓颉 SDK 获取类型、自动补全和诊断，并接入 Shiki 与 VitePress。能够复用的 Twoslash 协议、接口和渲染实现直接沿用上游。

支持类型悬浮提示、`^?` 查询、`^|` 补全、诊断校验、代码裁剪、高亮与自定义标签，以及通过 `@filename` 编写同一根模块中的多文件示例。各示例可覆盖 `cjpm.toml`，并复用依赖缓存。

在 VitePress 配置的 `vite.plugins` 中加入 `vitePluginCjslash({ sdkPath: '/path/to/cangjie' })` 即可接入。插件会安装语法、分析器、悬浮提示客户端和样式。设置了 `CJSLASH_SDK_PATH` 或 `CANGJIE_HOME` 时，可以直接调用 `vitePluginCjslash()`；没有 SDK 时提供静态高亮。

仓颉代码块使用 `cj cjslash`，TypeScript 代码块可以同时使用上游的 `ts twoslash`。每次仓颉分析都会创建独立工程与 LSP 会话，结束后自动清理；同一分析器上的调用依次执行。

项目正在准备首次发布。可以先按照本页的本地开发步骤运行工作区文档，使用仓颉 SDK 1.2.1 验证真实分析效果。SDK 需要自行安装，不随 npm 包分发。

- [认识 Cjslash](docs/guide/index.md)
- [安装与使用](docs/guide/install.md)
- [VitePress 集成](docs/guide/vitepress.md)
- [Shiki 集成](docs/guide/highlight.md)
- [注释标记](docs/refs/notations.md)
- [配置选项](docs/refs/options.md)
- [贡献指南](CONTRIBUTING.md#简体中文)
- [安全政策](SECURITY.md#简体中文)

项目自身代码使用 [MIT 协议](LICENSE)；上游依赖、语法文件和子模块保留各自的许可协议。
