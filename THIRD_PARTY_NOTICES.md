# Third-party notices

Cjslash's own code is licensed under MIT. Third-party code, grammars, dependencies, and submodules retain their original licenses.

| Component | Use in Cjslash | License |
| --- | --- | --- |
| [Twoslash](externals/twoslash) | Protocol types, compatible interfaces, and upstream reference implementation | [MIT](externals/twoslash/LICENSE) |
| `@shikijs/twoslash` and `@shikijs/vitepress-twoslash` | Shiki rendering, VitePress popup client, and shared styles | MIT; retain the notices distributed with those packages |
| [Cangjie VS Code extension](externals/vscode-cangjie) | Official `syntaxes/Cangjie.tmLanguage.json` grammar bundled in `@cjslash/shiki` | [Apache-2.0 with Runtime Library Exception](externals/vscode-cangjie/LICENSE) |

The upstream grammar is used without modification. The Shiki package build includes its upstream license alongside the bundled grammar. The MIT license for Cjslash does not replace that license.

The Cangjie SDK is installed separately and is not redistributed by this repository's npm packages. Other dependencies carry their own license files and notices.

Files under `externals/` are maintained as upstream submodules and must not be modified as part of Cjslash changes.

## 简体中文

Cjslash 自身代码使用 MIT 协议，第三方代码、语法、依赖和子模块保留各自的许可协议。

Twoslash 与 Shiki 的相关集成使用 MIT 协议。`@cjslash/shiki` 使用仓颉官方 VS Code 扩展中的未修改语法，并随构建产物附带其原始的 Apache-2.0 及运行库例外许可。Cjslash 的 MIT 协议不替代上游许可。

仓颉 SDK 需要自行安装，不随本项目的 npm 包分发。其他依赖的许可与声明以对应包附带的文件为准。`externals/` 中的任何文件都不能修改。
