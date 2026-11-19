# @cjslash/shiki

使用仓颉 SDK 分析代码，并通过 Shiki 展示类型悬浮提示、显式查询、诊断、高亮和自定义标签。

```ts
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

## 异步分析与同步渲染

`transformerCjslash` 返回继承 `ShikiTransformer` 的 `CjslashShikiTransformer`，增加 `prepare(code): Promise<CjslashResult>`。先等待分析完成，再将同一份**完整原始源码**传给 Shiki。裁剪和标记移除由分析结果决定；不需要手动将 `result.code` 传回 Shiki。

同一 transformer 中，相同原始源码的并发准备共享 Promise，成功结果可以反复渲染，失败后可以重试。不同源码独立缓存。缓存仅存在于该 transformer 的生命周期内；更改分析配置时创建新的 transformer。

分析器由调用方持有，通过 `await using` 或 `[Symbol.asyncDispose]()` 释放。已准备的结果在分析器释放后仍可渲染。`prepare` 失败直接拒绝 Promise；未准备的源码进入渲染阶段时，抛出上游的 `ShikiTwoslashError`，由 `throws` 或 `onTwoslashError` 处理。

## 选项与上游复用

`TransformerCjslashOptions` 继承 `@shikijs/twoslash/core` 的可用选项，渲染器接口、HAST 扩展和错误类直接重导出。节点拆分、定位和 HTML 生成使用上游的 `createTransformerFactory`。

| 选项 | 行为 |
| --- | --- |
| `cjslasher` | 必填，传入现有实例的 `analyze` 函数 |
| `cjslashOptions` | 传给每次分析的固定执行配置，创建 transformer 时保存数组及嵌套配置的副本 |
| `rendererRich` | 上游 `RendererRichOptions`，默认保留原始仓颉签名 |
| `renderer` | 使用上游 `TwoslashRenderer` 完全自定义渲染 |
| `langs`、`langAlias` | 默认分析 `cj`，并将 `cangjie`、`Cangjie` 映射到 `cj` |
| `explicitTrigger` | 默认 `false`；设为 `true` 时要求代码块元信息包含 `cjslash`，也可传正则 |
| `disableTriggers` | 默认 `['nocjslash', 'no-cjslash']` |
| `filter`、`throws`、`onTwoslashError`、`onShikiError` | 沿用上游接口与同步渲染行为 |

执行配置中的取消信号和回调保留原始引用。自定义标签通过 `cjslashOptions.customTags` 开启，例如 `['warn', 'error', 'log', 'annotate']`。分析能力和标记与 `cjslash` 一致，包含 `^|` 补全和 `@filename` 同模块多文件示例，直接使用上游渲染器；TypeScript 编译选项、上游同步 `twoslasher`、`typesCache` 和 `includesMap` 不属于此接口。

默认富文本渲染器生成上游的 `twoslash-*` CSS 类，展示时可复用 `@shikijs/twoslash/style-rich.css`。在应用入口直接导入该样式时，将 `@shikijs/twoslash` 声明为应用的直接依赖：

```ts
import '@shikijs/twoslash/style-rich.css'
```

悬浮文档保留 SDK 返回的内容；SDK 可能将紧邻声明的标记注释也作为文档返回。可通过上游的 `rendererRich.jsdoc` 或 `rendererRich.processHoverDocs` 控制文档展示。

`rendererClassic`、`rendererRich`、`ShikiTwoslashError` 以及 `HastExtension`、`RendererRichOptions`、`TwoslashRenderer` 均直接来自上游。直接调用重导出的 `rendererRich` 会保留其上游默认行为；创建 transformer 时使用 `rendererRich` 选项可应用本包的仓颉签名默认处理。

`cangjieLanguage` 使用 `externals/vscode-cangjie/syntaxes/Cangjie.tmLanguage.json` 的官方语法，发布构建将语法包含在产物中。

## 测试与构建

在仓库根目录运行，任务统一定义在 `vite.config.ts`：

```bash
vp run test
vp run test:coverage
vp run test:ui
CJSLASH_SDK_PATH=/path/to/cangjie vp run test:sdk
vp run build:shiki
```

单元测试使用真实 Shiki 和官方语法，模拟异步分析结果，验证缓存、失败重试、配置、触发条件和各类节点的 HTML。真实 SDK 测试验证 LSP 到 HTML 的完整流程，包括类型查询、预期诊断、裁剪、标签、Unicode 与 CRLF、标记保留及异步释放。

SDK 路径也可以通过 `CANGJIE_HOME` 指定；未配置路径时跳过集成测试，配置了不可用的 SDK 时测试失败。
