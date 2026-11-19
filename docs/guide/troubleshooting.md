---
description: 排查静态高亮、SDK 路径、类型查询、非预期诊断和悬浮层样式。
---

# 常见问题

## 代码有颜色，但没有类型悬浮

先确认是否配置了 `sdkPath`、`CJSLASH_SDK_PATH` 或 `CANGJIE_HOME`。没有 SDK 时，VitePress 插件仍会注册静态语法高亮。

然后检查围栏语言是否为 `cj`、`cangjie` 或 `Cangjie`，元信息是否包含 `cjslash`。普通 `cj` 围栏默认不参与分析。

如果使用自定义标签，确认已经配置 `cjslashOptions.customTags`。如果设置了 `noStaticSemanticInfo`，自动 hover 会关闭，但显式 `^?` 查询仍然保留。

## SDK 找不到或启动失败

`sdkPath` 应指向同时包含 `bin/cjc` 和 `tools/bin/LSPServer` 的根目录，而不是它的 `bin` 子目录。检查 SDK 是否匹配当前平台和架构，以及可执行文件是否具备运行权限。

可以直接执行编译器检查安装：

```bash
/path/to/cangjie/bin/cjc -v
```

`SDK_NOT_FOUND` 表示路径或可执行文件不可用，`SDK_INVALID` 表示编译器校验失败。LSP 的启动、退出和超时错误分别见[错误类型](../refs/api#errors)。

## `AsyncDisposableStack is not defined`

当前运行时缺少核心使用的资源管理 API。切换到提供 `AsyncDisposableStack` 和 `Symbol.asyncDispose` 的运行时，并确认启动文档构建时实际使用的是该运行时。

将 `await using` 改为显式调用 `[Symbol.asyncDispose]()` 只替换调用方语法；核心内部仍然需要 `AsyncDisposableStack`。

## `INVALID_QUERY`

`^` 必须落在上一行可查询的符号上。使用等宽空格对齐，确认没有把标记指向空行、隐藏区域或行外。核心坐标使用 UTF-16，不按字体显示宽度计算列号。

```cj
let answer = 42
//  ^?
main() { println(answer) }
```

SDK 在该位置没有返回 hover 时，也会出现此错误。先检查程序是否完整，或将查询移动到变量声明处。

## `UNEXPECTED_DIAGNOSTIC`

默认情况下，未列入 `handbookOptions.errors` 或 `@errors` 的诊断会使分析失败。诊断也可能是警告；按 SDK 实际返回的编号处理。

教学反例应声明允许的编号：

```cj
// @errors: 731
main() {
    let value: Int64 = "bad"
    println(value)
}
```

`@noErrorValidation` 保留诊断并跳过校验；`@noErrors` 抑制诊断。通常优先使用 `@errors`，使其余意外诊断仍能被发现。详细区别见[诊断标记](../refs/notations#diagnostics)。

## 包声明的位置或路径不正确

将 `package example.models` 放在源码顶部，再写 Cjslash 标记与声明。插件根据包名创建当前示例的临时目录；无需把包名写成 `default`。

代码块相互隔离，前一个代码块定义的类型和包不会自动出现在下一个代码块。重复使用的准备代码可以写进同一个完整示例，再用裁剪标记隐藏。

## `source has not been prepared`

直接调用 Shiki 时，先 `await transformer.prepare(source)`，再将同一份原始源码传给高亮器。即便只差末尾换行，也会是不同的缓存键。

使用 VitePress 时，确认 `vitePluginCjslash()` 放在 `vite.plugins`，并检查代码是否来自 `@include` 或 `<<<`。这些内容稍后才展开，需要单独准备，见[VitePress 准备边界](./vitepress#preparation)。

## 亮色模式下悬浮文字不清楚

检查 Shiki 的亮暗主题与悬浮层背景是否匹配。如果两种模式都选择深色代码主题，代码 token 的 `--shiki-light` 和 `--shiki-dark` 值相同是正常现象。

在站点主题中调整 `--twoslash-popup-bg`、`--twoslash-popup-color` 和 `--twoslash-border-color`，或为代码选择适合亮色模式的主题。本站为 Monokai 添加的 CSS 属于文档主题配置，见[VitePress 样式](./vitepress#styling)。

## 构建较慢或超时

每份首次分析的源码需要启动独立 LSP，同一分析器上的任务依次执行。transformer 会复用相同原始源码的成功结果，但不提供跨构建的磁盘缓存。

在慢速环境中，可以增大插件或分析器的 `timeout`（默认 `30_000` 毫秒）。也可以设置 `noStaticSemanticInfo: true`，仅保留需要的显式查询，减少自动 hover 请求。
