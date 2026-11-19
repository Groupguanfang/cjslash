import type { CangjieSdk } from './sdk'
import type { CjpmToml, CjpmTomlValue } from './types'
import fs from 'node:fs'
import os from 'node:os'
import { parseTOML, stringifyTOML } from 'confbox/toml'
import { hash } from 'ohash'
import path from 'pathe'
import { exec } from 'tinyexec'
import { URI } from 'vscode-uri'
import { isTomlSection, mergeCjpmToml, resolveCjpmToml } from './cjpm'

/**
 * Source-module configuration consumed by the Cangjie language server.
 *
 * ---
 *
 * 仓颉语言服务器接收的源码模块配置。
 */
export interface CjpmModule {
  /**
   * Root package name.
   *
   * ---
   *
   * 根包名。
   */
  name: string

  /**
   * Source-directory URI.
   *
   * ---
   *
   * 源码目录的 URI。
   */
  src_path: string

  /**
   * Whether the module is compiled as a combined library.
   *
   * ---
   *
   * 是否将模块合并编译为单个库。
   */
  combined: boolean

  /**
   * Dependency names mapped to source-module URIs.
   *
   * ---
   *
   * 依赖名称到源码模块 URI 的映射。
   */
  requires: Record<string, { path: string }>

  /**
   * Binary dependencies in the language server's option shape.
   *
   * ---
   *
   * 使用语言服务器选项形状的二进制依赖。
   */
  package_requires: { package_option: Record<string, string>, path_option: string[] }

  /**
   * Additional compiler options from the manifest.
   *
   * ---
   *
   * 工程清单中的额外编译选项。
   */
  command_option?: string
}

const installations = new Map<string, { signal: AbortSignal, promise: Promise<string | undefined> }>()
const dependencySections = [
  'dependencies',
  'test-dependencies',
  'dev-dependencies',
  'script-dependencies',
]

/**
 * Resolve source dependencies, installing missing remote modules when allowed.
 *
 * Successful resolutions and CJPM downloads survive individual analysis workspaces.
 * Installation failures warn and leave unresolved imports to normal LSP diagnostics.
 *
 * ---
 *
 * 解析源码依赖，并在允许时安装缺失的远程模块。
 *
 * 成功的解析记录和 CJPM 下载内容独立于单次分析工作区保留。
 * 安装失败时输出警告，未解析的导入仍交由 LSP 正常诊断。
 */
export async function resolveCjpmModules(sdk: CangjieSdk, manifest: CjpmToml, directory: string, workspaceRoot: string, autoInstall: boolean, signal: AbortSignal): Promise<Record<string, CjpmModule>> {
  const modules: Record<string, CjpmModule> = {}
  const cacheDirectory = path.join(workspaceRoot, 'cjslash-cache')
  const packageCache = path.join(cacheDirectory, 'packages')
  const replacements = isTomlSection(manifest.replace)
    ? Object.fromEntries(Object.entries(manifest.replace).map(([name, specification]) => [
        name,
        isTomlSection(specification) && typeof specification.path === 'string'
          ? {
              ...specification,
              path: path.resolve(specification.path),
            }
          : specification,
      ]))
    : {}
  const moduleLocks = new Map<string, CjpmToml>()
  let repositoryConfig: CjpmToml | undefined

  /**
   * Read repository settings lazily, keeping dependency-free examples free of cache files.
   *
   * ---
   *
   * 按需读取仓库配置，避免无依赖示例创建缓存文件。
   */
  function getRepositoryConfig(): CjpmToml {
    if (repositoryConfig) return repositoryConfig
    const configPath = [
      path.resolve('cangjie-repo.toml'),
      path.join(sdk.env.CJPM_CONFIG ?? path.join(os.homedir(), '.cjpm'), 'cangjie-repo.toml'),
      path.join(os.homedir(), '.cjpm/cangjie-repo.toml'),
      path.join(sdk.root, 'tools/config/cangjie-repo.toml'),
    ].find(filename => fs.existsSync(filename))
    repositoryConfig = mergeCjpmToml(
      configPath
        ? parseTOML<CjpmToml>(fs.readFileSync(configPath, 'utf8'))
        : {},
      {
        repository: {
          cache: { path: packageCache },
        },
      },
    )
    return repositoryConfig
  }

  /**
   * Locate a dependency from a successful resolution or CJPM's source cache.
   *
   * ---
   *
   * 根据成功的解析记录或 CJPM 源码缓存定位依赖。
   */
  function findCachedModule(name: string, specification: CjpmTomlValue, lock: CjpmToml = {}): string | undefined {
    const entry = isTomlSection(lock.requires)
      ? lock.requires[name]
      : undefined
    const locked = isTomlSection(entry)
      ? entry
      : {}
    const details = isTomlSection(specification)
      ? specification
      : {}
    const commit = typeof locked.source === 'string'
      ? locked.source.slice(locked.source.lastIndexOf('#') + 1)
      : locked.commitId ?? details.commitId
    const names = name.split('::')
    const moduleName = names.at(-1)!
    const version = locked.version ?? (typeof specification === 'string'
      ? specification
      : details.version)
    const candidate = details.git !== undefined
      ? typeof commit === 'string'
        ? path.join(packageCache, 'git', moduleName, commit)
        : undefined
      : typeof version === 'string'
        ? path.join(packageCache, 'repository/source', names.length > 1
            ? names[0]
            : 'default', `${moduleName}-${version}`)
        : undefined
    return candidate && fs.existsSync(path.join(candidate, 'cjpm.toml'))
      ? candidate
      : undefined
  }

  /**
   * Install one dependency and record its source location after CJPM succeeds.
   *
   * ---
   *
   * 安装单个依赖，并在 CJPM 成功后记录其源码位置。
   */
  async function install(name: string, specification: CjpmTomlValue, resolutionDirectory: string): Promise<string | undefined> {
    try {
      signal.throwIfAborted()
      fs.mkdirSync(path.join(resolutionDirectory, 'src'), { recursive: true })
      fs.writeFileSync(path.join(resolutionDirectory, 'cjpm.toml'), resolveCjpmToml(sdk.version, {
        dependencies: { [name]: specification },
        replace: replacements,
      }, 'cjslash_dependencies'))
      fs.writeFileSync(path.join(resolutionDirectory, 'src/index.cj'), 'package cjslash_dependencies\n')
      fs.writeFileSync(path.join(resolutionDirectory, 'cangjie-repo.toml'), stringifyTOML(getRepositoryConfig()), { mode: 0o600 })
      const env = { ...sdk.env }
      delete env.CJPM_CONFIG
      await exec(path.join(path.dirname(sdk.serverPath), `cjpm${path.extname(sdk.serverPath)}`), ['update', '--skip-script'], {
        signal,
        nodePath: false,
        throwOnError: true,
        nodeOptions: {
          cwd: resolutionDirectory,
          env,
          stdio: ['ignore', 'inherit', 'inherit'],
        },
      })
      signal.throwIfAborted()
      const lock = parseTOML<CjpmToml>(fs.readFileSync(path.join(resolutionDirectory, 'cjpm.lock'), 'utf8'))
      const resolved = findCachedModule(name, specification, lock)
      if (!resolved) throw new Error('CJPM did not provide a cached source module.')
      moduleLocks.set(resolved, lock)
      fs.writeFileSync(path.join(resolutionDirectory, 'resolved.json'), JSON.stringify(resolved))
      return resolved
    }
    catch (cause) {
      if (!signal.aborted) {
        console.warn(`[cjslash] Cannot install dependency ${name}: ${cause instanceof Error
          ? cause.message
          : String(cause)}`)
      }
      return undefined
    }
  }

  /**
   * Reuse installed modules and share an in-progress installation across analyzers.
   *
   * ---
   *
   * 复用已安装模块，并在分析器之间共享进行中的安装。
   */
  async function resolveDependency(name: string, specification: CjpmTomlValue, baseDirectory: string, lock?: CjpmToml): Promise<string | undefined> {
    signal.throwIfAborted()
    if (isTomlSection(specification) && typeof specification.path === 'string') return fs.realpathSync(path.resolve(baseDirectory, specification.path))
    const resolutionDirectory = path.join(cacheDirectory, 'resolutions', hash({
      sdk: sdk.root,
      version: sdk.version,
      name,
      specification,
      replacements,
      repository: getRepositoryConfig(),
    }))
    const resolvedFile = path.join(resolutionDirectory, 'resolved.json')
    try {
      const cached: unknown = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'))
      if (typeof cached === 'string' && fs.existsSync(path.join(cached, 'cjpm.toml'))) {
        const lockFile = path.join(resolutionDirectory, 'cjpm.lock')
        if (fs.existsSync(lockFile)) moduleLocks.set(cached, parseTOML<CjpmToml>(fs.readFileSync(lockFile, 'utf8')))
        return cached
      }
    }
    catch {}
    const cached = findCachedModule(name, specification, lock)
    if (cached) {
      if (lock) moduleLocks.set(cached, lock)
      if (autoInstall) {
        fs.mkdirSync(resolutionDirectory, { recursive: true })
        fs.writeFileSync(resolvedFile, JSON.stringify(cached))
        if (lock) fs.writeFileSync(path.join(resolutionDirectory, 'cjpm.lock'), stringifyTOML(lock))
      }
      return cached
    }
    if (!autoInstall) return undefined
    let installation = installations.get(resolutionDirectory)
    if (!installation) {
      const promise = install(name, specification, resolutionDirectory).finally((): void => {
        installations.delete(resolutionDirectory)
      })
      installation = { signal, promise }
      installations.set(resolutionDirectory, installation)
    }
    const resolved = await installation.promise
    signal.throwIfAborted()
    if (!resolved && installation.signal.aborted) return resolveDependency(name, specification, baseDirectory, lock)
    if (resolved) moduleLocks.set(resolved, parseTOML<CjpmToml>(fs.readFileSync(path.join(resolutionDirectory, 'cjpm.lock'), 'utf8')))
    return resolved
  }

  /**
   * Register one source module and recursively connect its dependency graph.
   *
   * ---
   *
   * 注册源码模块，并递归连接其依赖图。
   */
  async function visit(moduleDirectory: string, config: CjpmToml, baseDirectory: string): Promise<void> {
    const uri = URI.file(moduleDirectory).toString()
    if (Object.hasOwn(modules, uri)) return
    const metadata = config.package ?? {}
    const module: CjpmModule = {
      name: String(metadata.name ?? path.basename(moduleDirectory)),
      src_path: URI.file(path.resolve(moduleDirectory, String(metadata['src-dir'] ?? 'src'))).toString(),
      combined: false,
      requires: {},
      package_requires: { package_option: {}, path_option: [] },
    }
    modules[uri] = module
    if (typeof metadata['compile-option'] === 'string') module.command_option = metadata['compile-option']
    const sections = [
      config,
      ...(isTomlSection(config.target)
        ? Object.values(config.target).filter(isTomlSection)
        : []),
    ]
    for (const section of sections) {
      if (isTomlSection(section['bin-dependencies'])) {
        const binaries = section['bin-dependencies']
        if (Array.isArray(binaries['path-option'])) {
          for (const value of binaries['path-option']) {
            if (typeof value === 'string') module.package_requires.path_option.push(path.resolve(baseDirectory, value))
          }
        }
        if (isTomlSection(binaries['package-option'])) {
          for (const [name, value] of Object.entries(binaries['package-option'])) {
            if (typeof value === 'string') module.package_requires.package_option[name] = path.resolve(baseDirectory, value)
          }
        }
      }
      for (const key of dependencySections) {
        if (!isTomlSection(section[key])) continue
        for (const [name, value] of Object.entries(section[key])) {
          if (value === undefined) continue
          try {
            const specification = replacements[name] ?? value
            const dependencyDirectory = await resolveDependency(name, specification, Object.hasOwn(replacements, name)
              ? path.resolve('.')
              : baseDirectory, moduleLocks.get(moduleDirectory))
            if (!dependencyDirectory) continue
            module.requires[name] = {
              path: URI.file(dependencyDirectory).toString(),
            }
            await visit(dependencyDirectory, parseTOML<CjpmToml>(fs.readFileSync(path.join(dependencyDirectory, 'cjpm.toml'), 'utf8')), dependencyDirectory)
          }
          catch (cause) {
            signal.throwIfAborted()
            console.warn(`[cjslash] Cannot resolve dependency ${name}: ${cause instanceof Error
              ? cause.message
              : String(cause)}`)
          }
        }
      }
    }
  }

  await visit(directory, manifest, path.resolve('.'))
  return modules
}
