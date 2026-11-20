# Security Policy

[简体中文](#简体中文)

## Supported versions

During initial development, security fixes target the `main` branch. After releases are published, fixes target the latest published version of each affected package. Older versions do not have a separate maintenance commitment.

This policy covers `@cjslash/core`, `@cjslash/protocol`, `@cjslash/shiki`, `@cjslash/vitepress`, and this repository's documentation integration.

## Report a vulnerability

Use **Security → Advisories → Report a vulnerability** in this GitHub repository to send a private report when private vulnerability reporting is enabled.

If that option is unavailable, open an issue asking for a private reporting channel. Include only a general request for contact; keep vulnerability details, exploit code, private source, credentials, and sensitive logs out of public issues and pull requests.

Please include the following in your private report:

- Affected package and version, or repository commit.
- Operating system, architecture, JavaScript runtime, and Cangjie SDK version.
- A minimal reproducer and the relevant configuration.
- Expected behavior, observed behavior, and potential impact.
- Any suggested mitigation or fix.

Redact access tokens, registry credentials, personal file paths, and private repository URLs. Please allow time to investigate and coordinate a fix before disclosing technical details publicly.

## Execution and dependency boundaries

Cjslash launches the configured Cangjie SDK tools and creates temporary projects on the local machine. It does not provide a sandbox for untrusted documentation, source code, SDK binaries, or dependencies.

`autoInstallDependencies` defaults to `true`. Dependency declarations in `cjpmToml` and source annotations can trigger CJPM downloads, and installation progress is written to the host process output. Dependency caches can outlive individual analyses.

Only enable analysis for inputs and dependencies you trust. Set `autoInstallDependencies: false` when automatic downloads are unwanted. If your service accepts untrusted inputs, provide isolation, filesystem and network restrictions, and resource limits in the host environment.

Report issues in Cjslash's handling of these boundaries here. Vulnerabilities in the Cangjie SDK or other upstream dependencies should also be reported through their maintainers' security channels.

## 简体中文

### 支持范围

项目初始开发阶段的安全修复针对 `main` 分支。正式发布后，修复针对受影响包的最新发布版本，不承诺单独维护旧版本。

本政策涵盖 `@cjslash/core`、`@cjslash/protocol`、`@cjslash/shiki`、`@cjslash/vitepress` 以及本仓库的文档集成。

### 报告安全漏洞

当仓库启用了 GitHub 私密漏洞报告时，请通过本仓库的 **Security → Advisories → Report a vulnerability** 私下报告。

如果没有该入口，可以创建一个仅用于索取私密联系方式的 issue。请勿在公开 issue 或 PR 中提交漏洞细节、利用代码、私有源码、凭据或敏感日志。

私密报告中请包含受影响的包与版本或提交、操作系统及架构、JavaScript 运行时与仓颉 SDK 版本、最小复现、相关配置、预期与实际行为，以及可能的影响和修复建议。请先移除令牌、仓库凭据、个人文件路径和私有仓库地址。

请预留调查与协调修复的时间，再公开技术细节。

### 执行与依赖边界

Cjslash 会在本机运行配置的仓颉 SDK 工具并生成临时工程，不提供运行不受信任文档、源码、SDK 或依赖的沙箱。

`autoInstallDependencies` 默认为 `true`。`cjpmToml` 与源码注释中的依赖声明可能触发 CJPM 下载，安装输出会直接显示在宿主进程中，依赖缓存也可能在分析结束后保留。

请仅分析可信输入并使用可信依赖。无需自动下载时，设置 `autoInstallDependencies: false`。接收不可信输入的服务需要由宿主环境提供隔离、文件系统与网络限制以及资源限制。

Cjslash 自身在这些边界上的问题请向本项目报告；仓颉 SDK 或其他上游依赖的漏洞，也应通过对应维护者的安全渠道反馈。
