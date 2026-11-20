# Contributing to Cjslash

[简体中文](#简体中文)

Bug reports, documentation improvements, tests, and code contributions are welcome. For a larger change, open an issue to discuss the intended behavior before starting implementation. For vulnerabilities, follow [SECURITY.md](SECURITY.md).

## Set up the workspace

Use Node.js 24.11 or later in the 24.x line, or Node.js 26 or later. Install the pnpm version declared in the root `package.json`.

Fork and clone the repository, then run:

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm exec vp run setup
```

The setup task installs the Vite+ hook dispatcher using `hooks/`. Run it once per clone. Project hook scripts are versioned; the generated `hooks/_/` directory is ignored and can be recreated by setup.

You can run every `vp` command below as `pnpm exec vp` if Vite+ is not installed globally.

## Workspace layout

| Path | Responsibility |
| --- | --- |
| `packages/cjslash` | SDK discovery, temporary projects, LSP sessions, source analysis |
| `packages/cjslash-protocol` | Shared protocol types |
| `packages/cjslash-shiki` | Shiki grammar and transformer |
| `packages/cjslash-vitepress` | VitePress integration and client |
| `docs` | Chinese and English VitePress documentation |
| `externals` | Read-only upstream Git submodules |

Do not edit files under `externals/`. Make Cjslash-specific changes in the workspace packages or documentation.

## Development commands

All tasks are defined in the root `vite.config.ts`. Do not add `scripts` to any `package.json`.

| Command | Purpose |
| --- | --- |
| `vp run setup` | Install or refresh Git hooks |
| `vp run commit` | Create an emoji-prefixed Conventional Commit with Commitizen |
| `vp run check` | Run ESLint and both TypeScript checks |
| `vp run lint` | Check the whole workspace with ESLint |
| `vp run lint:fix` | Apply ESLint fixes |
| `vp run typecheck` | Check the root TypeScript project |
| `vp run typecheck:docs` | Check the documentation TypeScript project |
| `vp run test` | Run unit tests |
| `vp run test:watch` | Run unit tests in watch mode |
| `vp run test:ui` | Open the test UI with coverage |
| `vp run test:coverage` | Run unit tests with coverage |
| `vp run test:sdk` | Run real-SDK integration tests |
| `vp run build:vitepress` | Build all four workspace packages in dependency order |
| `vp run docs:dev` | Build workspace packages and start VitePress |
| `vp run docs:build` | Build workspace packages and the documentation site |
| `vp run docs:deploy` | Build the documentation and deploy it to Netlify |

### Use the Cangjie SDK

Install an SDK for your operating system and architecture. SDK 1.2.1 is used for the current integration examples. Point `CJSLASH_SDK_PATH` or `CANGJIE_HOME` at the directory containing `bin/cjc` and `tools/bin/LSPServer`:

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run test:sdk
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:build
```

Without either environment variable, SDK tests are skipped and the documentation uses static Cangjie highlighting. A configured but invalid SDK causes integration tests to fail.

Keep local SDK paths and credentials out of tracked files.

## Coding conventions

- Reuse compatible upstream types and implementations. Extend upstream interfaces when more information is needed.
- Declare function parameter and return types, including internal functions.
- Document custom APIs and functions in Markdown JSDoc: English first, a `---` separator, then Chinese.
- Keep imports and exports on one line where possible, without blank lines between import statements.
- Prefer existing upstream APIs over wrappers, and use extensionless imports where supported.
- Keep theme-specific presentation in the documentation theme.
- Use Vite+ test globals; do not explicitly import globals from `vite-plus/test`.
- Update the Chinese and English documentation together when public behavior changes.

For bug fixes and new behavior, add focused regression coverage to the relevant package. Use real-SDK integration tests when the behavior depends on LSP or compiler responses. Formatting-only changes do not need new tests.

Before submitting a pull request, run `vp run check`, the relevant tests, and any affected build. Run SDK tests and build the documentation with the SDK when changing Cangjie analysis or interactive examples. Mention unavailable checks in the pull request.

## Commit conventions

Use `vp run commit` to create commits with Commitizen and the shared commitlint configuration. Commit messages follow Conventional Commits with a leading type emoji:

```text
emoji type(scope): description
```

The scope is optional. Use a short description in English or Chinese. Headers must fit within 100 characters, types must be lowercase, and descriptions must not end with a period.

| Type | Emoji | Use |
| --- | --- | --- |
| `feat` | ✨ | New functionality |
| `fix` | 🐛 | Bug fixes |
| `docs` | 📚 | Documentation changes |
| `style` | 💄 | Formatting without behavior changes |
| `refactor` | 🔨 | Restructuring without adding features or fixing bugs |
| `perf` | 🚀 | Performance improvements |
| `test` | 🚨 | Tests and test fixtures |
| `build` | 🛠️ | Build tooling or dependencies |
| `ci` | ⚙️ | Continuous integration |
| `chore` | ♻️ | Repository maintenance |
| `revert` | 🗑️ | Reverting a previous change |

Suggested scopes include `cjslash`, `protocol`, `shiki`, `vitepress`, `docs`, `deps`, and `release`.

```text
✨ feat(cjslash): support completion queries
🐛 fix(vitepress): close popups when switching example tabs
📚 docs: 完善仓颉 SDK 安装说明
♻️ chore(deps): update Shiki dependencies
```

For breaking changes, add `!` after the type or scope and describe the migration in a `BREAKING CHANGE:` footer:

```text
✨ feat(protocol)!: change the query result format

BREAKING CHANGE: read query nodes from result.queries.
```

The `pre-commit` hook fixes supported staged files with ESLint and runs both TypeScript checks. The `prepare-commit-msg` hook opens Commitizen for interactive commits without a supplied message. The `commit-msg` hook validates the emoji prefix and Conventional Commits format using the same configuration as Commitizen. Test suites remain explicit tasks.

## Changesets and pull requests

For changes to published package behavior, APIs, or dependencies, add a changeset:

```bash
vp exec changeset
```

Select the affected packages, choose the appropriate version increment, and describe the user-visible effect. Documentation-only and repository-tooling changes normally do not need a changeset. Leave release versioning and publication to maintainers.

Keep pull requests focused. Explain the problem, resulting behavior, verification, and any remaining limitations. Link relevant issues and include screenshots when the rendered documentation changes.

## Automation and releases

GitHub Actions runs linting and TypeScript checks, unit tests on Linux, macOS, and Windows, real Cangjie SDK integration tests, and documentation builds for every pull request and push to `main`. Submodules are checked out recursively, and the SDK job uses the official Cangjie SDK 1.2.1 archive with a pinned SHA-256 checksum. The SDK download is cached between runs.

Pull requests that contain changesets receive a release pull request from the Release workflow. Merging that pull request versions the affected packages and publishes them to npm. The workflow builds every package after versioning and before `changeset publish`. Publishing uses npm Trusted Publishing through GitHub OIDC, with provenance generated by npm; no long-lived npm token is stored in the repository.

The deployment job in the CI workflow publishes production documentation from `main` with the Netlify CLI after every check passes. It deploys the documentation artifact built with the Cangjie SDK. Connect a Netlify site to this repository, set the `NETLIFY_AUTH_TOKEN` Actions secret and `NETLIFY_SITE_ID` Actions variable, and keep the repository's Netlify build settings aligned with `netlify.toml`. If you use Netlify's Git integration instead of the deployment job, the connected site builds with the SDK available on the Netlify image only; add an SDK in that environment to keep interactive examples enabled.

Pull requests from branches in this repository deploy the same SDK-built artifact to a Netlify preview after checks pass. The preview updates on each push to the pull request branch. Find its URL in the pull request's deployment section or the deployment job summary.

For local deployment, run `CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:deploy`. The task builds the documentation with the SDK and uploads the result directly to Netlify production. It runs a pinned Netlify CLI through `npm exec` from the independent `.netlify/cli` tool directory and explicitly sets the working directory to the repository root, avoiding the CLI's workspace package selection; workspace dependencies continue to use pnpm. On the first run, sign in and select or create the documentation site when the CLI prompts. The CLI stores the site link in the ignored `.netlify/` directory, so subsequent runs need only the same command. Local deployment does not require GitHub Actions secrets.

## Dependency updates

Renovate configuration lives in `renovate.json`. It schedules routine updates for Monday mornings in `Asia/Shanghai`, groups related toolchains, and leaves updates for review. Submodules under `externals/` are excluded.

The repository owner must enable the Renovate GitHub App for this repository after it is uploaded. Keep `pnpm-lock.yaml` consistent with dependency changes and preserve the workspace's supply-chain policies.

## License

Contributions to Cjslash's own code are made under the [MIT License](LICENSE). Retain the licenses and notices of upstream code and assets; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 简体中文

欢迎提交问题、改进文档、完善测试和贡献代码。较大的行为变更请先通过 issue 讨论；安全问题请遵循 [安全政策](SECURITY.md#简体中文)。

### 开发环境

使用 Node.js 24.11 及以上的 24.x 版本，或 Node.js 26 及以上版本，以及根目录 `package.json` 声明的 pnpm 版本。克隆后依次执行：

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm exec vp run setup
pnpm exec vp run check
pnpm exec vp run test
```

`setup` 会安装使用 `hooks/` 的 Vite+ 提交钩子，每个克隆目录执行一次。`hooks/_/` 是可重新生成的分发器，不提交到仓库。没有全局 `vp` 时，使用 `pnpm exec vp` 执行本指南中的命令。

所有任务集中在根目录 `vite.config.ts`，不要在 `package.json` 中添加 `scripts`。完整命令见本页开发命令表。`externals/` 中的任何文件都不能修改。

仓颉 SDK 需要自行安装。通过 `CJSLASH_SDK_PATH` 或 `CANGJIE_HOME` 指定 SDK 根目录后，可以运行真实集成测试和带交互效果的文档：

```bash
CJSLASH_SDK_PATH=/path/to/cangjie vp run test:sdk
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:dev
CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:build
```

未设置 SDK 路径时，集成测试会跳过，文档使用静态仓颉高亮；设置了无效路径时，集成测试会失败。请勿提交个人 SDK 路径、令牌或其他凭据。

### 代码与验证

尽量复用上游接口和实现；需要额外信息时继承上游接口。所有函数都声明参数与返回类型，自定义 API 与函数使用 Markdown 文档注释：上方英文，中间 `---`，下方中文。

导入导出尽量单行，不在各条导入语句之间留空行，支持时省略导入扩展名。避免多余包装；主题特化样式放在文档主题中。测试使用 Vite+ 全局 API，不显式导入 `vite-plus/test`。公共行为变化时同步更新中英文文档。

为修复和新增行为补充有针对性的测试。涉及 LSP 或编译器行为时，使用真实 SDK 验证。提交 PR 前运行 `vp run check`、相关测试和受影响的构建；修改分析逻辑或交互示例时，再运行 SDK 测试与带 SDK 的文档构建。无法执行的检查需要在 PR 中说明。

### 提交与发布说明

通过 `vp run commit` 使用 Commitizen 创建提交。提交信息使用 `emoji type(scope): description`，各类型对应的表情符号见本页表格。类型使用英文小写值，scope 可选，说明可以使用中文或英文，标题不超过 100 个字符且不以句点结尾。破坏性变更使用 `!`，并通过 `BREAKING CHANGE:` 说明迁移方式。

`pre-commit` 自动修复支持的暂存文件并检查两套 TypeScript 配置；`prepare-commit-msg` 在交互式提交且未提供提交信息时启动 Commitizen；`commit-msg` 与 Commitizen 共用配置，校验表情前缀和 Conventional Commits 格式。测试套件按需显式运行。

修改包的公共行为、API 或依赖时，通过 `vp exec changeset` 添加变更说明。仅修改文档或仓库工具时通常不需要 changeset；版本发布由维护者处理。

PR 应围绕一个明确目标，说明问题、修改后的行为、验证结果和剩余限制，并关联相关 issue。涉及文档效果变化时附上截图。

Renovate 在上海时区的周一早晨安排常规依赖更新，相关工具链分组更新，交由维护者审核；不更新 `externals/` 子模块。上传 GitHub 后，仓库所有者需要为仓库启用 Renovate GitHub App。

### 自动化与发布

GitHub Actions 会在每次拉取请求和推送到 `main` 时运行 ESLint、两套 TypeScript 检查、Linux/macOS/Windows 单元测试、真实仓颉 SDK 集成测试和文档构建。CI 会递归检出子模块，并使用固定 SHA-256 校验值的官方仓颉 SDK 1.2.1 压缩包；下载的 SDK 会跨运行缓存。

包含 changeset 的拉取请求会收到 Release 工作流创建的发布拉取请求。合并后，工作流会更新受影响包的版本并发布到 npm；发布前会构建全部包。发布会通过 GitHub OIDC 使用 npm Trusted Publishing，由 npm 生成 provenance，仓库中不保存长期 npm token。

CI 工作流中的部署任务会在全部检查通过后，通过 Netlify CLI 将使用仓颉 SDK 构建的文档产物发布到 `main` 的生产环境。需要先在 Netlify 创建站点并配置 `NETLIFY_AUTH_TOKEN` Actions secret 和 `NETLIFY_SITE_ID` Actions variable，同时让 Netlify 的构建设置与 `netlify.toml` 保持一致。若改用 Netlify Git 集成而不是部署任务，Netlify 镜像默认没有仓颉 SDK；需要在 Netlify 环境中安装 SDK 才能保留交互示例。

从本仓库分支创建的 PR 会在全部检查通过后，将同一份 SDK 文档产物部署为 Netlify 预览。每次推送到 PR 分支都会更新预览；可在 PR 的部署区域或部署任务摘要中找到预览地址。

本地部署时，运行 `CJSLASH_SDK_PATH=/path/to/cangjie vp run docs:deploy` 即可使用 SDK 构建文档并直接上传到 Netlify 生产环境。任务在独立的 `.netlify/cli` 工具目录中通过 `npm exec` 运行固定版本的 Netlify CLI，并显式将工作目录设置为仓库根目录，避免 CLI 要求选择工作区中的包；工作区依赖继续由 pnpm 管理。首次运行时按 CLI 提示登录并选择或创建文档站点。CLI 会把站点关联保存在已忽略的 `.netlify/` 目录，后续只需重复同一条命令。本地部署不需要 GitHub Actions secrets。

对项目自身代码的贡献使用 [MIT 协议](LICENSE)，第三方代码与资源保留各自的许可和声明。
