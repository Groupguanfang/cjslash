# @cjslash/core

通过仓颉 SDK 的 LSP 分析代码示例，生成兼容 `twoslash-protocol` 的节点。

```ts
import { createCjslasher } from '@cjslash/core'

await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  workspaceRoot: './.cjslash',
  timeout: 30_000,
})

const result = await cjslasher.analyze(`
let answer = 42
//  ^?
main() { println(answer) }
`)

console.log(result.code)
console.log(result.queries[0].text)
```

`sdkPath` 指向包含 `bin/cjc` 和 `tools/bin/LSPServer` 的 SDK 根目录。默认使用当前 `process.platform` 和 `process.arch` 定位 SDK 文件，也可通过 `platform`、`arch` 显式指定。创建分析器时只解析 SDK；每次 `analyze()` 都会启动独立 LSP、建立独立临时 cjpm 工程并在结束后释放，同一实例上的调用依次执行。使用 `await using` 或调用 `[Symbol.asyncDispose]()` 可取消当前分析并等待清理，重复释放会返回相同的 Promise。

`workspaceRoot` 指定工程生成的父目录，省略时使用系统临时目录。相对路径在创建分析器时解析为绝对路径，不存在的父目录会自动创建。每次分析在其中生成独立的 `cjslash-<随机值>/<根模块名>/` 子目录，结束或初始化失败后只清理该次生成的子目录，保留父目录及其他已有文件。

`cjpmToml` 接收 `CjpmToml` 类型的可序列化 JavaScript 对象，与默认配置合并后，经 `confbox` 的 `stringifyTOML` 序列化并写入 `cjpm.toml`。`package.src-dir` 可覆盖为工程内的相对目录，`package.name` 会由示例顶部的包声明覆盖：

```ts
await using cjslasher = await createCjslasher({
  sdkPath: '/path/to/cangjie',
  cjpmToml: {
    package: {
      'version': '0.2.0',
      'output-type': 'static',
      'src-dir': 'src',
    },
  },
})
```

示例顶部的 `package example.models.user` 会生成模块名 `example`，源码写入临时工程的 `src/models/user/index.cj`；单段包写入 `src/index.cj`。没有包声明时使用 `default` 包。因此不同代码块可以声明各自独立的包，不会共用上一个代码块的文件路径或包名。

`cjpmToml` 也支持单次执行覆盖，以及 `// @package.version: "0.2.0"`、`// @dependencies.utility: { git = "https://example.com/utility.git", tag = "v1.0.0" }` 这样的源码注释。注释中的值使用 TOML 语法。优先级为默认清单、实例配置、单次配置、源码注释；表递归合并，数组整体替换，标记从展示源码中移除，覆盖不会泄漏到其他代码块。

`autoInstallDependencies` 默认为 `true`。未缓存的 Git 或中央仓库依赖通过 `cjpm update --skip-script` 下载，输出直接展示在当前终端。本地 `path` 依赖直接读取，远程下载和成功的解析记录保存在 `workspaceRoot/cjslash-cache/`，省略父目录时使用系统临时目录。同一个包和版本会跨分析及实例复用，新增依赖只下载未缓存的包；单次工程清理保留依赖缓存。设置 `autoInstallDependencies: false` 关闭自动下载，仍可使用本地和已缓存依赖。

安装失败会输出警告并继续分析，不退出宿主进程、不缓存失败结果，后续分析可重试。未解析导入仍由正常诊断规则处理；需要保留诊断继续渲染时使用 `@noErrorValidation`。

`analyze(code, 'cj', options)` 返回 `Promise<CjslashResult>`。`nodes` 使用上游节点形状，`hovers`、`queries`、`errors`、`highlights`、`tags`、`completions` 均从 `nodes` 动态派生。输出节点位置对应裁剪后的 `result.code`，`meta` 中的查询、高亮和裁剪位置对应原始输入；偏移、长度及列号使用 UTF-16 code unit，行号和列号从零开始。

支持以下标记：

| 标记 | 行为 |
| --- | --- |
| `//  ^?` | 查询上一行对应列的类型信息 |
| `//  ^\|` | 请求上一行光标位置的补全，按已输入的标识符前缀筛选 |
| `// @filename: main.cj` | 开始同一根模块中的另一个虚拟源文件 |
| `//  ^^^^^^ message` | 高亮上一行对应范围，可附加说明 |
| `// ---cut---`、`// ---cut-before---` | 隐藏此行及之前的代码 |
| `// ---cut-after---` | 隐藏此行及之后的代码 |
| `// ---cut-start---`、`// ---cut-end---` | 隐藏成对标记之间的代码及标记行 |
| `// @errors: 731` | 允许指定诊断编号，多个编号用空格分隔 |
| `// @noErrors`、`// @noErrors: 731` | 抑制全部诊断或指定编号的诊断 |
| `// @noErrorValidation` | 保留诊断，关闭非预期诊断校验 |
| `// @noStaticSemanticInfo` | 关闭自动 hover，保留显式查询 |
| `// @keepNotations` | 保留输入代码及标记 |
| `// @noErrorsCutted` | 忽略隐藏代码中的诊断 |
| `// @note: text` | 使用 `customTags: ['note']` 提取自定义标签 |

标记须独占一行，字符串及多行注释中的相同文本不会作为标记处理。布尔标记可使用 `: true` 或 `: false`。非预期诊断会抛出 `CjslashError`，其中 `code` 为 `UNEXPECTED_DIAGNOSTIC`，`diagnostics` 包含原始输入坐标下的诊断节点。

实例选项可以提供默认的 `handbookOptions`、`customTags`、`positionQueries`、`positionCompletions`、`positionHighlights`、`shouldGetHoverInfo` 和 `filterNode`，单次分析选项可覆盖它们；`handbookOptions` 按字段合并，源码中的标记优先于选项。单次分析也可传入 `signal` 取消任务，后续分析会在需要时重建 LSP 会话。

补全位置对准已输入前缀之后的光标，节点直接使用上游 `NodeCompletion` 和 `CompletionEntry`。`positionCompletions` 允许指向 EOF。没有匹配候选时抛出 `INVALID_COMPLETION`，可通过 `noErrorValidation` 保留空节点。不完整表达式可用 `@noErrors` 抑制诊断。

`@filename` 文件共用一个工程和 LSP，支持跨文件声明、导入、补全和诊断。每个文件从顶部的 `package` 推导目录，文件名为相对 `.cj` 路径；指定目录时需与包路径一致，也可仅指定文件名。文件必须属于同一个根模块，不能重名或包含 `..`。`@filename` 行保留在展示源码中，诊断及 hover 筛选回调使用实际虚拟文件名；所有节点仍使用完整代码块的全局坐标。

`@showEmit`、`@showEmittedFile` 编译产物展示，以及在 `@filename` 中定义多个根模块尚未实现，TypeScript 编译选项不适用于仓颉。其他根模块应通过工程依赖引入。相关不支持的标记会明确报错。

## 测试

在仓库根目录运行，所有任务统一定义在根目录 `vite.config.ts` 的 `run.tasks` 中。配置已设置 `test.globals: true`，测试直接使用全局 API，无需显式导入；TypeScript 类型通过 `tsconfig.json` 中的 `vite-plus/test/globals` 提供：

```bash
vp run test
vp run test:watch
vp run test:ui
vp run test:coverage
```

这些命令分别执行单次测试、监听测试、启动 UI 和收集覆盖率。`vp run test:ui` 调用 `vp test watch --project unit --ui --coverage`，同时展示测试结果和覆盖率；打开终端输出的带 token 地址即可查看，修改代码后会自动重跑。测试任务均禁用任务缓存，确保每次实际执行。

单元测试不要求安装仓颉 SDK，覆盖标记解析、UTF-16 坐标、结果转换、协议兼容性、SDK 环境、分析队列、取消、超时和 LSP 资源释放。LSP 测试使用模拟进程与连接，同时验证真实临时文件的创建和清理。

覆盖率报告输出到仓库根目录的 `coverage/`，包含终端汇总、HTML 和 JSON。语句、函数及行覆盖率下限为 90%，分支覆盖率下限为 85%。

真实 SDK 测试通过独立的 `sdk` 测试项目运行：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run test:sdk
```

也可以通过 `CANGJIE_HOME` 指定 SDK。没有配置 SDK 路径时，集成测试会显示为跳过；配置了路径但 SDK 无法启动时，测试会失败。集成测试验证真实 hover、补全、跨文件引用与导入、诊断、裁剪、高亮、标签、Unicode、重复分析和 `await using`。
