---
description: 将异步仓颉分析结果接入 Shiki，生成类型感知的高亮 HTML。
---

# Shiki 语法高亮

`@cjslash/shiki` 把 `cjslash` 的分析结果接入 Shiki。节点拆分、位置映射和 HTML 渲染复用 `@shikijs/twoslash`，使用相同的 `twoslash-*` CSS 类。

## 安装

```bash
pnpm add -D cjslash @cjslash/shiki shiki @shikijs/twoslash
```

`@shikijs/twoslash` 在这里用于直接导入展示样式；高亮器使用 `@cjslash/shiki` 导出的仓颉语法。

## 先分析，再高亮

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

仓颉 LSP 是异步的，而 Shiki transformer 在渲染时同步读取结果。因此必须先等待 `prepare(source)`，再把**完全相同的原始源码**传给 `codeToHtml()`。不要替换为 `result.code`，裁剪与坐标转换会由 transformer 完成。

## 安装展示样式

在展示 HTML 的应用入口导入：

```ts twoslash
import '@shikijs/twoslash/style-rich.css'
```

此样式供默认富文本渲染器使用。若希望在 VitePress 中获得 FloatingVue 悬浮层，请使用 [VitePress 插件](./vitepress)，它会自动安装客户端和样式。

## 准备结果的缓存

同一 transformer 按完整原始源码缓存成功结果。相同源码的并发 `prepare()` 共享一个 Promise，失败后可以重试。缓存属于 transformer 实例，不是磁盘缓存，也不跨构建保存。

执行选项在创建 transformer 时保存，可克隆的配置会被复制；取消信号和回调保留原始引用。更换 SDK 或分析配置时应创建新的 transformer。已准备的结果可以在分析器释放后继续渲染。

分析器由调用方管理，transformer 不会替调用方释放它。

## 触发规则

Shiki 集成默认转换 `cj`，同时支持 `cangjie`、`Cangjie` 别名，默认不要求 `cjslash` 元信息。设置 `explicitTrigger: true` 后，只转换元信息包含 `cjslash` 的代码块：

```ts twoslash
import { transformerCjslash } from '@cjslash/shiki'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const transformer = transformerCjslash({
  cjslasher: cjslasher.analyze,
  explicitTrigger: true,
})
```

`nocjslash` 和 `no-cjslash` 默认禁用转换。直接调用 Shiki 时，元信息通过 `meta: { __raw: 'cjslash' }` 传入。触发规则只决定渲染阶段是否转换，不能替代 `prepare()`。

## 自定义渲染

`rendererRich` 使用上游 `RendererRichOptions`，例如隐藏 SDK 返回的文档正文：

```ts twoslash
import { transformerCjslash } from '@cjslash/shiki'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const transformer = transformerCjslash({
  cjslasher: cjslasher.analyze,
  rendererRich: { jsdoc: false },
})
```

完全自定义 HTML 时可以传入上游 `TwoslashRenderer` 形状的 `renderer`。`rendererClassic`、`rendererRich`、`ShikiTwoslashError` 和相关类型直接重导出，接口见[API 参考](../refs/api)。

## 错误处理

`prepare()` 失败会直接拒绝 Promise，需要由调用方捕获。`throws`、`onTwoslashError` 和 `onShikiError` 控制同步渲染阶段的上游行为，不会捕获前一步的异步分析异常。

遇到“source has not been prepared”时，检查是否等待了准备完成，以及两次传入的源码在换行符和末尾空白上是否一致。
