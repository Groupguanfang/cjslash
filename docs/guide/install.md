---
description: 安装仓颉 SDK，创建 Cjslash 分析器并管理其异步生命周期。
---

# 安装与使用

本页介绍返回结构化结果的核心包。如果希望直接在 Markdown 中使用交互代码块，请先阅读 [VitePress 集成](./vitepress)；如果需要高亮 HTML，请阅读 [Shiki 集成](./highlight)。

## 准备运行环境

分析在能够运行仓颉 SDK 的本地环境中执行。JavaScript 运行时需要提供 `AsyncDisposableStack` 和 `Symbol.asyncDispose`；使用 `await using` 的源码还需要相应的语法或转译支持。

可以检查运行时是否具备所需 API：

```bash
node -p "typeof AsyncDisposableStack"
node -p "typeof Symbol.asyncDispose"
```

预期分别输出 `function` 和 `symbol`。

安装适合当前操作系统和 CPU 架构的仓颉 SDK。`sdkPath` 指向 SDK 根目录，其下应包含：

```text
cangjie/
├── bin/cjc
├── tools/bin/LSPServer
└── runtime/lib/
```

Windows 下对应的可执行文件使用 `.exe` 扩展名。文档示例使用 SDK 1.2.1 验证。

## 安装核心包

```bash
pnpm add -D @cjslash/core
```

核心 API 通过 `sdkPath` 显式指定 SDK。读取 `CJSLASH_SDK_PATH` 和 `CANGJIE_HOME` 的便利行为属于 VitePress 插件。

## 创建分析器

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

`result.code` 是移除注释标记和隐藏区域后的源码；`result.queries` 包含显式查询节点。结果本身不包含高亮 HTML，详细字段见[分析结果](../refs/result)。

`createCjslasher()` 校验 SDK，并返回异步分析器。每次 `analyze()` 都创建独立临时工程和 LSP 会话，分析结束后释放它们。同一分析器上的调用按队列依次执行，不会共享前一个示例的源码或包声明。

## 释放资源

`await using` 在离开作用域时调用 `[Symbol.asyncDispose]()`。如果所在环境不能使用该语法，可以显式释放：

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

释放会取消执行中和排队的任务，等待资源清理。已释放的实例不能继续分析；重复释放共享同一个清理 Promise。

## 编写独立示例

每个示例应包含完整的仓颉分析上下文。可以用 [`@filename`](../refs/notations#files) 组织同一根模块的多个文件，用[裁剪标记](../refs/notations#cutting)隐藏准备代码；隐藏部分仍参与分析。

如果需要声明包，将 `package` 放在源码顶部：

```cj cjslash
package example.models.user

let answer = 42
//  ^?
main() { println(answer) }
```

上例生成模块名为 `example` 的临时工程，并将源码写入 `src/models/user/index.cj`。单段包名使用 `src/index.cj`，没有声明时使用 `default` 包。映射仅用于当前示例，不会从其他代码块导入文件。

## 在本仓库中开发文档

根目录的任务由 `vite.config.ts` 管理：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:build
```

这两个任务会先构建文档依赖的工作区包。SDK 路径也可通过 `CANGJIE_HOME` 指定；没有配置 SDK 时，文档仍能构建，但仓颉代码块仅有静态高亮。
