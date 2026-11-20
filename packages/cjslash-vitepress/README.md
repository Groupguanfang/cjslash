# @cjslash/vitepress

在 VitePress 中展示仓颉代码的类型悬浮提示、查询、补全和诊断。渲染、FloatingVue 客户端、Vue 转义及样式复用 `@shikijs/vitepress-twoslash`；仓颉分析通过 `@cjslash/core` 的异步 SDK 会话完成。

## 安装与配置

```bash
pnpm add -D @cjslash/vitepress shiki vitepress
```

在 `.vitepress/config.ts` 的 `vite.plugins` 中调用一个函数即可：

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

插件自动完成仓颉语法与 Shiki transformer 注册、Markdown 异步准备、FloatingVue 客户端与样式安装，以及分析器的按需创建和异步释放。无需额外的辅助文件，也无需在主题中编写 `enhanceApp`。已有的主题导出、`extends` 和 `enhanceApp` 会保留，文档主题样式仍可覆盖共用样式。

省略 `sdkPath` 时，插件通过 Vite 的环境加载器读取 `CJSLASH_SDK_PATH`，其次读取 `CANGJIE_HOME`，也支持站点根目录下的 `.env` 文件。已经配置环境变量时，直接使用 `vitePluginCjslash()`。没有 SDK 或借用的分析器时，保持静态仓颉高亮。

通过 `vitePluginCjslash({ workspaceRoot: './.cjslash' })` 可指定分析工程的生成父目录，也可与 `sdkPath` 一起配置。每个示例使用独立子目录，分析结束后只清理该子目录，保留父目录；省略时使用系统临时目录。

随后在 Markdown 中使用：

````md
```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```
````

普通 `cj` 代码块继续使用静态语法高亮。`cangjie` 和 `Cangjie` 是默认语言别名。

## 异步准备

`vitePluginCjslash` 在 VitePress 转换 Markdown 前准备页面源码。`<!-- @include: ... -->` 和 `<<<` 代码片段在渲染阶段展开，因此自动准备只覆盖页面源码中直接出现的围栏；包含文件中的围栏需要在调用方显式准备，或直接写在页面源码中。

同一 transformer 内，相同源码的并发准备共享 Promise，成功结果按完整源码缓存。修改代码后会分析新源码，失败后可以重试。更换分析配置或 SDK 时应创建新的 transformer。缓存随 transformer 的生命周期释放，已准备的结果在分析器释放后仍可渲染。

直接调用 Shiki 时，先 `await transformer.prepare(code)`，再把同一份完整原始 `code` 传给高亮器。`prepareMarkdown(source)` 处理围栏信息和 VitePress 的尾部空白标准化，通常由 `vitePluginCjslash` 调用。

VitePress 的本地搜索索引不经过 Vite 模块转换，同一页面可能以未经准备的源码再次渲染。`vitePluginCjslash` 默认启用 `allowUnprepared`，让这类渲染降级为普通语法高亮；页面渲染仍读取已准备结果。设置 `allowUnprepared: false` 时，未准备源码会抛出 `ShikiTwoslashError`，便于发现遗漏的准备步骤。

## 手动管理分析器与高亮

需要自定义生命周期时，可以传入现有分析函数：

```ts
vitePluginCjslash({ cjslasher: existingAnalyzer.analyze })
```

借用的分析器由调用方负责释放。若主题已手动安装客户端和样式，可以设置 `injectClient: false`。

`transformerCjslash({ cjslasher })` 保留为底层 API，供直接调用 Shiki 或自定义构建流程使用。其默认 `allowUnprepared` 为 `false`。也可以把现有 transformer 传给 `vitePluginCjslash(transformer)`，由插件完成注册与准备；此调用形式不会自动安装客户端。

## 接口与上游复用

`VitePluginCjslashOptions` 继承底层 `VitePressPluginCjslashOptions` 中的渲染选项，并复用 `CjslashOptions` 中的 SDK 和工作区配置：

| 选项 | 行为 |
| --- | --- |
| `sdkPath` | 可选，优先于 `CJSLASH_SDK_PATH` 和 `CANGJIE_HOME` |
| `platform`、`arch`、`workspaceRoot`、`cjpmToml`、`autoInstallDependencies`、`timeout` | 复用分析器配置，在插件创建分析器时传入 |
| `cjslasher` | 可选，借用现有实例的 `analyze` 方法；插件不会释放它 |
| `injectClient` | 默认 `true`，通过主题入口安装共用客户端和样式 |
| `allowUnprepared` | 插件默认 `true`，底层 transformer 默认 `false` |
| `cjslashOptions` | 每个示例共用的执行配置；创建 transformer 时复制可克隆的配置 |
| `explicitTrigger` | 默认要求元信息包含 `cjslash`；可设为 `false` 或自定义正则 |
| `disableTriggers` | 默认 `['nocjslash', 'no-cjslash']` |
| `langs`、`langAlias` | 默认 `cj`，以及 `cangjie`、`Cangjie` 别名 |
| `floatingVue`、`errorRendering`、`renderer` | 直接使用上游接口与渲染行为 |
| `processHoverInfo` | 默认保留仓颉签名，支持自定义处理 |
| `filter` | 使用上游完整 Shiki 配置和上下文执行 |
| `throws`、`onTwoslashError`、`onShikiError` | 直接使用上游错误处理 |

自定义 `filter` 可以依赖渲染时才存在的 Shiki 上下文。提供它时会预先分析所有围栏，再由上游执行筛选；未被选择的围栏即使分析失败也不影响渲染。

`prepare()` 的错误直接拒绝 Promise。Vite 插件会保留这些错误，并在渲染阶段交给上游错误处理器；默认生产构建失败，`throws: false` 时使用上游降级逻辑。错误恢复和回调的名字沿用上游，无需另学一套接口。

执行配置中的 `signal` 和回调保留原始引用。自定义标签放在 `cjslashOptions.customTags`，例如 `['warn', 'error', 'log', 'annotate']`。不提供 TypeScript 编译器配置、同步 `twoslasher`、`typesCache` 或 `includesMap`。

代码块可使用 `// @package.version: "0.2.0"` 和 `// @dependencies.example: { git = "https://example.com/example.git" }` 覆盖工程配置，也可在 `cjslashOptions.cjpmToml` 中设置共用覆盖项。插件默认自动下载未缓存的依赖并将 CJPM 进度输出到当前终端；设置顶层 `autoInstallDependencies: false` 可关闭下载。下载失败输出警告，开发服务器继续运行，未解析导入仍沿用诊断和渲染错误处理。成功的依赖缓存保存在 `workspaceRoot/cjslash-cache/`，分析器释放后仍会保留。

直接复用的导出包括 `rendererFloatingVue`、`TwoslashFloatingVueOptions`、`TwoslashFloatingVueRendererOptions`、`ShikiTwoslashError` 和客户端的 `FloatingVueConfig`。`cangjieLanguage` 来自 `@cjslash/shiki`，使用只读 `externals/vscode-cangjie` 中的官方语法；发布构建会将语法包含到 Shiki 包的产物中。

## 仓库文档与验证

现有中英文文档已接入此包。通过 `CJSLASH_SDK_PATH` 或 `CANGJIE_HOME` 启用真实分析，未配置时只启用静态仓颉高亮：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:build
```

文档按需创建分析器，关闭构建或开发服务器时异步释放。构建任务自动先生成 protocol、cjslash、Shiki 和 VitePress 包的产物，所有任务均定义在 `vite.config.ts`。

```bash
vp run test
vp run test:coverage
vp run test:ui
CJSLASH_SDK_PATH=/path/to/cangjie vp run test:sdk
vp run build:vitepress
```

单元测试使用真实 Shiki 和 VitePress，验证异步准备、触发规则、错误恢复、Vue 转义、代码块包装及与原有 Markdown 功能的兼容。真实 SDK 集成测试验证查询、悬浮提示、诊断、普通代码块和异步释放。
