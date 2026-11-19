---
description: Prepare asynchronous Cangjie analysis results and render type-aware HTML with Shiki.
---

# Shiki highlighting

`@cjslash/shiki` connects `cjslash` analysis results to Shiki. Node splitting, position mapping, and HTML rendering reuse `@shikijs/twoslash` and its `twoslash-*` CSS classes.

## Install

```bash
pnpm add -D cjslash @cjslash/shiki shiki @shikijs/twoslash
```

`@shikijs/twoslash` is included here for the stylesheet imported directly by your application. Use the Cangjie grammar exported by `@cjslash/shiki` in the highlighter.

## Analyze before highlighting

```ts twoslash
import { cangjieLanguage, transformerCjslash } from '@cjslash/shiki'
import { createCjslasher } from 'cjslash'
import { createHighlighter } from 'shiki'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const transformer = transformerCjslash({ cjslasher: cjslasher.analyze })
const source = 'let answer = 42\n//  ^?\nmain() { println(answer) }\n'

await transformer.prepare(source)

const highlighter = await createHighlighter({
  langs: [cangjieLanguage],
  themes: ['monokai'],
})

try {
  const html = highlighter.codeToHtml(source, {
    lang: 'cj',
    theme: 'monokai',
    transformers: [transformer],
  })
  console.log(html)
}
finally {
  highlighter.dispose()
}
```

The Cangjie LSP is asynchronous, while the Shiki transformer reads results synchronously during rendering. Wait for `prepare(source)`, then pass the **exact same original source** to `codeToHtml()`. Do not replace it with `result.code`: the transformer applies cropping and position adjustments.

## Load the presentation styles

Import the stylesheet in the application that displays the HTML:

```ts twoslash
import '@shikijs/twoslash/style-rich.css'
```

This stylesheet supports the default rich renderer. For FloatingVue popups in VitePress, use the [VitePress plugin](./vitepress), which installs its client and styles automatically.

## Prepared result caching

A transformer caches successful results by their complete original source. Concurrent `prepare()` calls for identical source share one promise, and failed preparation can be retried. This cache belongs to the transformer instance; it is not a disk cache and does not persist across builds.

Execution options are captured when the transformer is created. Cloneable settings are copied; signals and callbacks keep their original references. Create a new transformer when changing the SDK or analysis settings. Prepared results can still be rendered after the analyzer has been disposed.

The caller owns the analyzer. The transformer does not dispose it.

## Trigger rules

The Shiki integration processes `cj` by default, with `cangjie` and `Cangjie` aliases. It does not require `cjslash` metadata by default. Set `explicitTrigger: true` to require that metadata:

```ts twoslash
import { transformerCjslash } from '@cjslash/shiki'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const transformer = transformerCjslash({
  cjslasher: cjslasher.analyze,
  explicitTrigger: true,
})
```

`nocjslash` and `no-cjslash` disable transformation by default. When calling Shiki directly, pass metadata as `meta: { __raw: 'cjslash' }`. Trigger rules control rendering and do not replace the preparation step.

## Customize rendering

`rendererRich` accepts upstream `RendererRichOptions`. For example, hide documentation returned by the SDK:

```ts twoslash
import { transformerCjslash } from '@cjslash/shiki'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const transformer = transformerCjslash({
  cjslasher: cjslasher.analyze,
  rendererRich: { jsdoc: false },
})
```

For complete control over HTML output, pass a `renderer` implementing the upstream `TwoslashRenderer` shape. `rendererClassic`, `rendererRich`, `ShikiTwoslashError`, and related types are re-exported directly; see the [API reference](../refs/api).

## Handle errors

`prepare()` rejects directly when analysis fails. Catch that rejection in the calling code. `throws`, `onTwoslashError`, and `onShikiError` control upstream behavior during synchronous rendering; they do not catch the earlier asynchronous analysis failure.

If you see “source has not been prepared,” check that preparation finished and that the source, including line endings and trailing whitespace, is identical in both calls.
