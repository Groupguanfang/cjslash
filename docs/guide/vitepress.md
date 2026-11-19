---
description: 通过一个 Vite 插件在 VitePress 中启用仓颉类型悬浮、查询与诊断。
---

# VitePress 集成

在 VitePress 配置中调用 `vitePluginCjslash()`，即可接入仓颉语法、异步分析、悬浮层客户端与样式。

## 安装与配置

在已有的 VitePress 工程中安装：

```bash
pnpm add -D @cjslash/vitepress shiki
```

在 `.vitepress/config.ts` 中配置 SDK 路径：

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

插件自动注册仓颉语法与 transformer，在 Markdown 渲染前准备分析结果，并通过主题入口安装 FloatingVue 客户端和样式。已有主题导出和 `enhanceApp` 会保留，分析器随构建或开发服务器关闭而释放。

需要指定分析工程的生成位置时，直接向插件传入 `workspaceRoot`，例如 `vitePluginCjslash({ sdkPath: '/path/to/cangjie', workspaceRoot: './.cjslash' })`。每个示例在该目录下生成独立子目录，分析结束后自动清理，父目录会保留。

## 通过环境变量配置 SDK

如果不想将路径写入配置，使用 `vitePluginCjslash()`，并设置环境变量：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie pnpm exec vitepress dev docs
```

也可以在 VitePress 站点根目录（此例为 `docs/`）的 `.env` 文件中填写：

```dotenv
CJSLASH_SDK_PATH=/path/to/cangjie
```

查找顺序是显式 `sdkPath`、`CJSLASH_SDK_PATH`、`CANGJIE_HOME`。没有 SDK，也没有借用的分析器时，插件提供静态仓颉高亮，不生成类型或诊断。

## 编写代码块

默认只有带 `cjslash` 元信息的仓颉围栏参与分析：

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

`cangjie` 和 `Cangjie` 是默认别名。普通的 `cj` 代码块仅做静态高亮。更多语法见[注释标记](../refs/notations)。

需要默认分析所有仓颉围栏时，可以设置 `explicitTrigger: false`；此时可在单个围栏中使用 `nocjslash` 或 `no-cjslash` 禁用分析。

## 分析与渲染选项

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

`errorRendering`、`floatingVue`、`renderer` 和错误回调沿用 `@shikijs/vitepress-twoslash` 的接口。诊断策略、自定义标签等执行选项放在 `cjslashOptions` 中；SDK 路径、`workspaceRoot`、超时、`cjpmToml` 和 `autoInstallDependencies` 则直接传给插件。`autoInstallDependencies` 默认为 `true`，安装失败仅输出警告，开发服务器继续运行。完整清单见[配置选项](../refs/options)。

## 与 TypeScript Twoslash 共用 {#twoslash}

同一站点可以同时启用 TypeScript Twoslash 和 Cjslash。先安装上游集成：

```bash
pnpm add -D @shikijs/vitepress-twoslash
```

将 `transformerTwoslash()` 加到 `markdown.codeTransformers`，保留 `vitePluginCjslash()`：

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

TypeScript 使用 `ts twoslash`，仓颉使用 `cj cjslash`。两个分析器各自处理对应语言的标记、类型和诊断，共用 `vitePluginCjslash()` 自动安装的 FloatingVue 客户端与样式，无需重复安装客户端。本文档也使用这套组合：

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

`twoslashOptions` 配置 TypeScript 分析，`cjslashOptions` 和 `cjpmToml` 配置仓颉分析，两者互不覆盖。

## 样式与主题 {#styling}

共用样式在站点主题之前加载，可以在自己的 `.vitepress/theme/style.css` 中调整悬浮层：

```css
:root {
  --twoslash-popup-bg: #1d1e19;
  --twoslash-popup-color: #f8f8f2;
  --twoslash-border-color: rgba(45, 232, 159, 0.22);
}
```

选择背景和文字颜色时需与代码主题配套。当前文档在明暗模式中都使用 Monokai，因此悬浮层也使用深色背景；这是本站的主题选择。自己的站点可以分别配置明暗主题和对应的样式。

## 借用现有分析器

需要管理分析器生命周期时，传入现有实例的 `analyze` 方法：

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { createCjslasher } from 'cjslash'

await using cjslasher = await createCjslasher({ sdkPath: '/path/to/cangjie' })
const plugin = vitePluginCjslash({ cjslasher: cjslasher.analyze })
```

应让该作用域覆盖整个 VitePress 构建或开发服务器生命周期。插件不会释放借用的分析器。若应用需要直接导入 `cjslash`，还应将它安装为直接依赖。

## 准备阶段的边界 {#preparation}

自动准备处理页面源码中直接出现的围栏。VitePress 的 `@include` 和 `<<<` 代码片段在稍后的渲染阶段展开，因此被引入的围栏不在自动准备范围内。可以将示例直接写入页面，或用底层 `transformerCjslash()` 与 `prepareMarkdown()` 管理准备流程。

本地搜索等功能可能绕过 Vite 的 Markdown 转换。插件默认 `allowUnprepared: true`，这类渲染会使用静态高亮；设置为 `false` 可以让遗漏的准备步骤报错。

传入自定义 `filter` 时，插件会预先准备所有围栏，再在渲染阶段用完整的 Shiki 上下文执行筛选。应避免对非仓颉围栏做过宽的匹配。

底层 `transformerCjslash({ cjslasher })` 默认要求源码已准备。将该 transformer 传给 `vitePluginCjslash(transformer)` 时，插件不自动安装客户端。通常应优先使用本页开头的单函数接入。
