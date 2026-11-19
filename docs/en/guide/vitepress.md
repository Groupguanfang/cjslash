---
description: Add Cangjie type hovers, queries, and diagnostics to VitePress with one Vite plugin.
---

# VitePress integration

Add `vitePluginCjslash()` to your VitePress configuration to install the Cangjie grammar, asynchronous analysis, popup client, and styles.

## Install and configure

In an existing VitePress project, install:

```bash
pnpm add -D @cjslash/vitepress shiki
```

Configure the SDK path in `.vitepress/config.ts`:

```ts twoslash
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

The plugin registers the grammar and transformer, prepares results before Markdown rendering, and installs the FloatingVue client and styles through the theme entry. Existing theme exports and `enhanceApp` are preserved. The owned analyzer is disposed when the build or development server closes.

To choose where analysis projects are generated, pass `workspaceRoot` directly to the plugin, for example `vitePluginCjslash({ sdkPath: '/path/to/cangjie', workspaceRoot: './.cjslash' })`. Each example uses a unique child directory that is cleaned up after analysis; the parent directory is retained.

## Configure the SDK through the environment

To keep the path out of your configuration, call `vitePluginCjslash()` without options and set an environment variable:

```bash
CJSLASH_SDK_PATH=/path/to/cangjie pnpm exec vitepress dev docs
```

Alternatively, add an `.env` file in the VitePress site root (`docs/` in this example):

```dotenv
CJSLASH_SDK_PATH=/path/to/cangjie
```

The lookup order is explicit `sdkPath`, `CJSLASH_SDK_PATH`, then `CANGJIE_HOME`. Without an SDK or a borrowed analyzer, the plugin provides static Cangjie highlighting without type information or diagnostics.

## Write code blocks

By default, only Cangjie fences containing `cjslash` metadata are analyzed:

````md
```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```
````

```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```

`cangjie` and `Cangjie` are default aliases. Regular `cj` blocks use static highlighting only. See [Notations](../refs/notations) for the supported annotations.

To analyze all Cangjie fences by default, set `explicitTrigger: false`. You can then disable individual fences with `nocjslash` or `no-cjslash`.

## Analysis and rendering options

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { defineConfig } from 'vitepress'

export default defineConfig({
  vite: {
    plugins: [
      vitePluginCjslash({
        sdkPath: '/path/to/cangjie',
        timeout: 30_000,
        errorRendering: 'hover',
        cjslashOptions: {
          customTags: ['warn', 'error', 'log', 'annotate'],
        },
      }),
    ],
  },
})
```

`errorRendering`, `floatingVue`, `renderer`, and error callbacks follow `@shikijs/vitepress-twoslash`. Put execution settings such as diagnostic rules and custom tags in `cjslashOptions`; pass SDK settings, `workspaceRoot`, timeout, `cjpmToml`, and `autoInstallDependencies` directly to the plugin. `autoInstallDependencies` defaults to `true`; installation failures warn while the development server keeps running. See [Options](../refs/options) for the complete list.

## Use with TypeScript Twoslash {#twoslash}

Enable TypeScript Twoslash and Cjslash in the same site. First install the upstream integration:

```bash
pnpm add -D @shikijs/vitepress-twoslash
```

Add `transformerTwoslash()` to `markdown.codeTransformers` alongside `vitePluginCjslash()`:

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'

export default defineConfig({
  vite: {
    plugins: [
      vitePluginCjslash({ sdkPath: '/path/to/cangjie' }),
    ],
  },
  markdown: {
    languages: ['js', 'jsx', 'ts', 'tsx'],
    codeTransformers: [
      transformerTwoslash(),
    ],
  },
})
```

Use `ts twoslash` for TypeScript and `cj cjslash` for Cangjie. Each analyzer handles its own language's annotations, types, and diagnostics. Both use the FloatingVue client and styles installed automatically by `vitePluginCjslash()`, so no additional client installation is needed. This documentation uses the same combination:

```ts twoslash
const message = 'Hello, TypeScript'
//    ^?
console.log(message.toUpperCase())
```

```cj cjslash
let message = "Hello, Cangjie"
//  ^?
main() { println(message) }
```

Configure TypeScript through `twoslashOptions` and Cangjie through `cjslashOptions` and `cjpmToml`. Their analysis settings remain independent.

## Styles and themes {#styling}

Shared styles load before the site theme. Customize the popup in your own `.vitepress/theme/style.css`:

```css
:root {
  --twoslash-popup-bg: #1d1e19;
  --twoslash-popup-color: #f8f8f2;
  --twoslash-border-color: rgba(45, 232, 159, 0.22);
}
```

Match the popup background and text to your code theme. This documentation uses Monokai in both appearance modes, so it also uses a dark popup background. Your site can use separate light and dark code themes with corresponding styles.

## Borrow an existing analyzer

To manage the analyzer lifecycle yourself, pass an existing instance's `analyze` method:

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const plugin = vitePluginCjslash({ cjslasher: cjslasher.analyze })
```

Keep this scope alive for the complete VitePress build or development server lifecycle. The plugin does not dispose a borrowed analyzer. Install `cjslash` as a direct dependency if your application imports it.

## Preparation boundaries {#preparation}

Automatic preparation handles fences directly present in page source. VitePress expands `@include` and `<<<` snippets later during rendering, so imported fences are outside this automatic preparation step. Write examples directly in the page, or use the lower-level `transformerCjslash()` and `prepareMarkdown()` APIs to manage preparation.

Features such as local search can render Markdown outside Vite's transform pipeline. The plugin defaults to `allowUnprepared: true`, allowing static highlighting in these renders. Set it to `false` to report missing preparation steps.

With a custom `filter`, the plugin prepares every fence, then evaluates the filter during rendering with the full Shiki context. Avoid matching non-Cangjie fences too broadly.

The lower-level `transformerCjslash({ cjslasher })` requires prepared source by default. Passing that transformer to `vitePluginCjslash(transformer)` does not automatically install the client. The single-function setup at the start of this page is the usual entry point.
