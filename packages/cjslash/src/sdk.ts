import fs from 'node:fs'
import process from 'node:process'
import path from 'pathe'
import { execSync } from 'tinyexec'
import { CjslashError } from './error'

/**
 * A validated Cangjie SDK installation.
 *
 * ---
 *
 * 已验证的仓颉 SDK 安装。
 */
export interface CangjieSdk {
  /**
   * Absolute path to the SDK root.
   *
   * ---
   *
   * SDK 根目录的绝对路径。
   */
  readonly root: string

  /**
   * Environment variables configured for SDK tools.
   *
   * ---
   *
   * 为 SDK 工具配置的环境变量。
   */
  readonly env: NodeJS.ProcessEnv

  /**
   * Cangjie compiler version reported by the SDK.
   *
   * ---
   *
   * SDK 报告的仓颉编译器版本。
   */
  readonly version: string

  /**
   * Absolute path to the SDK language server.
   *
   * ---
   *
   * SDK 语言服务器的绝对路径。
   */
  readonly serverPath: string
}

/**
 * Resolve and validate a Cangjie SDK installation.
 *
 * ---
 *
 * 解析并校验仓颉 SDK 安装。
 */
export async function resolveSdk(sdkPath: string, timeout: number, platform: NodeJS.Platform = process.platform, architecture: NodeJS.Architecture = process.arch): Promise<CangjieSdk> {
  if (typeof sdkPath !== 'string' || !sdkPath.trim()) throw new CjslashError('SDK_NOT_FOUND', 'A Cangjie SDK root path is required.')

  let root: string
  const executableSuffix = platform === 'win32'
    ? '.exe'
    : ''
  try {
    root = fs.realpathSync(sdkPath)
    for (const binary of ['bin/cjc', 'tools/bin/LSPServer']) {
      fs.accessSync(path.join(root, `${binary}${executableSuffix}`), platform === 'win32'
        ? fs.constants.F_OK
        : fs.constants.X_OK)
    }
  }
  catch (cause) {
    throw new CjslashError('SDK_NOT_FOUND', `Cannot find executable cjc and LSPServer binaries in ${sdkPath}.`, { cause })
  }

  const runtimeArchitecture = architecture === 'arm64'
    ? 'aarch64'
    : architecture === 'x64'
      ? 'x86_64'
      : architecture
  const runtimePlatform = platform === 'win32'
    ? 'windows'
    : platform
  const runtime = path.join(root, 'runtime/lib', `${runtimePlatform}_${runtimeArchitecture}_cjnative`)
  const tools = path.join(root, 'tools/lib')
  const delimiter = platform === 'win32'
    ? ';'
    : ':'
  const env: NodeJS.ProcessEnv = { ...process.env, CANGJIE_HOME: root }
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH'
  env[pathKey] = [
    path.join(root, 'bin'),
    path.join(root, 'tools/bin'),
    ...(platform === 'win32'
      ? [runtime, tools]
      : []),
    env[pathKey],
  ].filter(Boolean).join(delimiter)
  const libraryKey = platform === 'darwin'
    ? 'DYLD_FALLBACK_LIBRARY_PATH'
    : 'LD_LIBRARY_PATH'
  if (platform !== 'win32') env[libraryKey] = [runtime, tools, env[libraryKey]].filter(Boolean).join(delimiter)

  try {
    const { stdout, stderr } = execSync(path.join(root, 'bin', `cjc${executableSuffix}`), ['-v'], {
      timeout,
      throwOnError: true,
      nodePath: false,
      nodeOptions: { env },
    })
    const version = `${stdout}\n${stderr}`.match(/Cangjie Compiler:\s*(\d+\.\d+\.\d+)/)?.[1]
    if (!version) throw new Error('The compiler did not report a Cangjie SDK version.')
    return {
      root,
      env,
      version,
      serverPath: path.join(root, 'tools/bin', `LSPServer${executableSuffix}`),
    }
  }
  catch (cause) {
    throw new CjslashError('SDK_INVALID', `Cannot execute the Cangjie compiler in ${root}.`, { cause })
  }
}
