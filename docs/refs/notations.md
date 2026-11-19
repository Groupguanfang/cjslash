---
outline: deep
description: 仓颉示例中的类型查询、补全、多文件、高亮、裁剪、诊断和自定义标签语法。
---

# 注释标记

标记写在独占一行的 `//` 注释中。字符串和多行注释里的相同文本不会被解析；正常情况下，标记会从展示源码中移除。

如果示例有 `package` 声明，先将它写在文件顶部，再写标记。完整源码参与 SDK 分析，裁剪在收集语义信息之后发生。

下方示例可切换“渲染结果”和“输入代码”标签；输入代码保留所有标记与隐藏片段，便于查看完整写法。

## 类型查询 {#queries}

将 `^?` 放到上一行符号的下方。`^` 所在的列决定查询位置：

```cj cjslash
let answer = 42
//  ^?
main() { println(answer) }
```

显式查询生成 `query` 节点；普通符号的自动悬浮信息生成 `hover` 节点。关闭自动 hover 不会关闭显式查询。

## 自动补全 {#completions}

将 `^|` 对准上一行的光标位置，即已输入前缀之后，而不是前缀的第一个字符：

```cj cjslash
// @noErrors
main() {
    let message = "hello"
    message.c
//           ^|
}
```

分析器向仓颉 LSP 请求补全，按已输入的标识符前缀筛选，生成上游 `NodeCompletion` 节点。光标在 `.` 等字符之后时会保留服务器返回的候选。`@noErrors` 用于抑制不完整表达式产生的诊断。

没有候选时默认抛出 `INVALID_COMPLETION`；`@noErrorValidation` 可以保留空的补全节点。关闭自动 hover 不会关闭补全。也可通过 `positionCompletions` 指定原始输入中的光标偏移，允许指向文件结尾。

候选取决于 SDK 对当前源码的解析结果。尽量保留完整的函数和包上下文；例如，未闭合的函数可能使 SDK 无法解析成员补全，抑制诊断不会修复这类语法上下文。

## 多文件示例 {#files}

`@filename` 开始一个虚拟文件。同一代码块中的文件共享临时工程和 LSP，会互相解析声明与导入：

```cj cjslash
// @filename: models/data.cj
package example.models
public let answer = 42

// @filename: main.cj
// ---cut---
package example
import example.models.*
main() { println(answer) }
//               ^?
```

每个文件的 `package` 声明都写在该文件顶部。上述文件会写入 `src/models/data.cj` 和 `src/main.cj`；也可仅写 `data.cj`，目录仍由 `package example.models` 推导。提供目录时，目录必须与包名去掉根模块后的部分一致。

文件名必须是相对 `.cj` 路径，不能包含 `..`，不能重名或映射到同一个实际源文件。所有文件必须属于同一个根模块；没有包声明时使用 `default`。首个 `@filename` 前的实际代码属于隐式 `index.cj`，仅有注释和空白的前导内容不会额外创建文件。

`@filename` 行保留在展示源码中作为分隔。裁剪仍可隐藏整个文件，隐藏文件继续参与分析。节点使用整个展示代码块的坐标；诊断的 `filename` 和 `shouldGetHoverInfo` 收到的文件名对应相应虚拟文件。

## 范围高亮 {#highlights}

连续两个或更多 `^` 标记上一行的范围，空格后可附加说明：

```cj cjslash
let answer = 42
//  ^^^^^^ important
main() { println(answer) }
```

范围从第一个 `^` 对应的列开始，长度为 `^` 的数量。是否显示说明及具体样式由渲染器决定。

## 裁剪代码 {#cutting}

示例需要完整，读者却不一定需要看到所有准备代码。裁剪隐藏源码，同时保留完整程序分析得到的可见节点。

### 隐藏前置代码

`// ---cut---` 是 `// ---cut-before---` 的简写。它隐藏标记行及之前的源码：

```cj cjslash
package example.models

let answer = 42
// ---cut---
main() { println(answer) }
```

可见的 `answer` 仍能获得类型信息，因为它的声明参加了分析。

### 隐藏后置代码

`// ---cut-after---` 隐藏标记行及之后的源码：

```cj cjslash
let answer = 42
// ---cut-after---
main() { println(answer) }
```

### 隐藏中间片段

`// ---cut-start---` 与 `// ---cut-end---` 隐藏二者之间的代码及标记行。标记必须成对出现：

```cj cjslash
let answer = 42
// ---cut-start---
let hidden = 0
// ---cut-end---
main() { println(answer + hidden) }
```

裁剪后的节点位置对应 `result.code`。原始裁剪区间保存在 `result.meta.removals`，详见[分析结果](./result)。

## 诊断标记 {#diagnostics}

### `@errors`

允许列出的仓颉诊断编号，多个编号以空格分隔。允许的诊断仍会显示，其他诊断默认使分析失败：

```cj cjslash
// @errors: 731
main() {
    let value: Int64 = "bad"
    println(value)
}
```

列表是允许出现的编号，不要求每个编号都实际出现。数字和字符串编号均受支持，具体编号取决于 SDK。

### `@noErrors`

`// @noErrors` 或 `// @noErrors: true` 抑制全部诊断；`// @noErrors: 731` 仅抑制指定编号。被抑制的诊断不进入结果，也不参与校验。

`// @noErrors: false` 取消该抑制设置。

### `@noErrorValidation`

保留诊断，但跳过允许编号的校验：

```cj cjslash
// @noErrorValidation
main() {
    let value: Int64 = "bad"
    println(value)
}
```

适合查看 SDK 返回的诊断，再确定应填写的 `@errors` 编号。

### `@noErrorsCutted`

忽略起始位置在隐藏区域内的诊断。否则，隐藏的源码同样需要通过默认诊断校验：

```cj cjslash
// @noErrorsCutted
let hidden: Int64 = "bad"
// ---cut---
let answer = 42
//  ^?
main() { println(answer) }
```

## 覆盖工程配置 {#overriding-options}

沿用 Twoslash 的 `// @选项: 值` 写法，覆盖目标改为 `cjpm.toml` 字段。字段路径使用 TOML 的点分键，冒号后使用 TOML 值；字符串需要引号，也可以使用数字、布尔值、数组和行内表。省略值表示 `true`。

```cj cjslash
package example
// @package.version: "0.2.0"
// @package.src-dir: "examples"
// @profile.build.incremental
let answer = 42
//  ^?
main() { println(answer) }
```

这些注释在展示源码中移除，并与 API 的 `cjpmToml` 配置递归合并。源码注释的优先级最高，相同字段最后一次声明生效，数组整体替换。配置作用于当前代码块中的全部文件，不影响其他代码块。`package.name` 仍跟随源码的根包声明。

依赖也可以直接写在注释里：

```cj
package example
// @dependencies.utility: { git = "https://example.com/utility.git", tag = "v1.0.0" }
// @dependencies.local: { path = "./libraries/local" }
// @dependencies."org::library": "1.0.0"
import utility.*
main() {}
```

本地依赖路径以调用进程的当前工作目录为基准。默认自动安装未缓存的远程依赖；通过实例选项 `autoInstallDependencies: false` 可关闭下载，注释不能改变此开关。安装进度直接输出到终端，安装失败不会退出当前进程。具体行为见[依赖安装与缓存](./options#dependency-installation-and-caching)。

## 其他分析标记

| 标记 | 行为 |
| --- | --- |
| `// @noStaticSemanticInfo` | 关闭自动 hover，保留显式 `^?` 查询 |
| `// @keepNotations` | 保留原始源码和所有标记，节点位置对应原始输入 |

这两个标记以及 `@noErrorValidation`、`@noErrorsCutted` 都可显式使用 `: true` 或 `: false`。源码标记优先于调用选项，作用于整个示例。

## 自定义标签 {#tags}

先在执行选项中注册名称：

```ts twoslash
import { vitePluginCjslash } from '@cjslash/vitepress'
import { defineConfig } from 'vitepress'

export default defineConfig({
  vite: {
    plugins: [
      vitePluginCjslash({
        cjslashOptions: {
          customTags: ['warn', 'error', 'log', 'annotate'],
        },
      }),
    ],
  },
})
```

之后就可以提取对应注释：

```cj cjslash
// @warn: Read the inferred type below.
let answer = 42
main() { println(answer) }
```

标签生成 `tag` 节点，具体展示取决于渲染器。未注册的 `@name` 不会被当作普通注释忽略，而会报告不支持的标记；可选择与内置选项不同的自定义名称。

## 尚未支持 {#unsupported}

`@showEmit`、`@showEmittedFile` 编译产物展示尚未实现；TypeScript 编译选项标记不适用于仓颉。它们会产生 `UNSUPPORTED_FEATURE`，参见[兼容性说明](../guide/compatibility)。目前也不支持在同一代码块中自动创建多个根模块。
