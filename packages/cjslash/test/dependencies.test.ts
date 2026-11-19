import type { CjpmModule } from '../src/dependencies'
import type { CangjieSdk } from '../src/sdk'
import type { CjpmToml } from '../src/types'
import fs from 'node:fs'
import { parseTOML, stringifyTOML } from 'confbox/toml'
import path from 'pathe'
import { exec } from 'tinyexec'
import { URI } from 'vscode-uri'
import { resolveCjpmToml } from '../src/cjpm'
import { resolveCjpmModules } from '../src/dependencies'

vi.mock('tinyexec', () => ({
  exec: vi.fn(),
}))

let directory: string
let sdk: CangjieSdk

/**
 * Write a source-module fixture with a real manifest.
 *
 * ---
 *
 * 写入包含真实工程清单的源码模块夹具。
 */
function writeModule(name: string, overrides: CjpmToml = {}, moduleDirectory = path.join(directory, name)): string {
  const manifest = resolveCjpmToml('1.2.1', overrides, name)
  fs.mkdirSync(path.join(moduleDirectory, 'src'), { recursive: true })
  fs.writeFileSync(path.join(moduleDirectory, 'cjpm.toml'), manifest)
  fs.writeFileSync(path.join(moduleDirectory, 'src/index.cj'), `package ${name}\npublic let answer = 42\n`)
  return moduleDirectory
}

/**
 * Resolve an application against the real filesystem and a mocked CJPM command.
 *
 * ---
 *
 * 使用真实文件系统和模拟的 CJPM 命令解析应用依赖。
 */
function resolve(overrides: CjpmToml = {}, autoInstall = true, signal = new AbortController().signal): Promise<Record<string, CjpmModule>> {
  const moduleDirectory = writeModule('app', overrides)
  return resolveCjpmModules(sdk, parseTOML<CjpmToml>(fs.readFileSync(path.join(moduleDirectory, 'cjpm.toml'), 'utf8')), moduleDirectory, directory, autoInstall, signal)
}

/**
 * Emulate CJPM downloads and its lock file without requiring network access.
 *
 * ---
 *
 * 模拟 CJPM 下载及锁文件，无需访问网络。
 */
function installFixture(_command: string, _args: readonly string[] = [], options: Parameters<typeof exec>[2] = {}): ReturnType<typeof exec> {
  const project = String(options.nodeOptions?.cwd)
  const manifest = parseTOML<CjpmToml>(fs.readFileSync(path.join(project, 'cjpm.toml'), 'utf8'))
  const name = Object.keys(manifest.dependencies as object)[0]
  const dependency = (manifest.dependencies as CjpmToml)[name]
  const cache = path.join(directory, 'cjslash-cache/packages')
  if (typeof dependency === 'string') {
    const names = name.split('::')
    writeModule(names.at(-1)!, {}, path.join(cache, 'repository/source', names.length > 1
      ? names[0]
      : 'default', `${names.at(-1)}-${dependency}`))
    fs.writeFileSync(path.join(project, 'cjpm.lock'), stringifyTOML({
      version: 1,
      requires: {
        [name]: { version: dependency },
      },
    }))
  }
  else {
    writeModule(name, {}, path.join(cache, 'git', name, 'abc123'))
    fs.writeFileSync(path.join(project, 'cjpm.lock'), stringifyTOML({
      version: 0,
      requires: {
        [name]: { commitId: 'abc123' },
      },
    }))
  }
  return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }) as unknown as ReturnType<typeof exec>
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.resolve('.cjslash-dependencies-test-'))
  sdk = {
    root: '/sdk',
    version: '1.2.1',
    serverPath: '/sdk/tools/bin/LSPServer',
    env: {},
  }
  vi.spyOn(console, 'warn').mockImplementation((): void => {})
  vi.mocked(exec).mockReset().mockImplementation(installFixture)
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('cJPM dependency resolution', () => {
  it('does not create caches or start CJPM for a dependency-free example', async () => {
    const modules = await resolve()
    expect(Object.values(modules)).toEqual([
      expect.objectContaining({ name: 'app', requires: {} }),
    ])
    expect(exec).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(directory, 'cjslash-cache'))).toBe(false)
  })

  it('resolves local and transitive source modules with automatic installation disabled', async () => {
    const leaf = writeModule('leaf')
    const dependency = writeModule('dependency', {
      dependencies: {
        leaf: { path: '../leaf' },
        app: { path: '../app' },
      },
    })
    const modules = await resolve({
      dependencies: {
        dependency: { path: dependency },
      },
    }, false)
    const application = modules[URI.file(path.join(directory, 'app')).toString()]
    expect(application.requires.dependency.path).toBe(URI.file(dependency).toString())
    expect(modules[URI.file(dependency).toString()].requires.leaf.path).toBe(URI.file(leaf).toString())
    expect(Object.keys(modules)).toHaveLength(3)
    expect(exec).not.toHaveBeenCalled()
  })

  it('installs new dependencies once, persists successes, and keeps the CJPM output attached to the host', async () => {
    const first = { git: 'https://example.com/first.git', tag: 'v1' }
    await resolve({
      dependencies: { first },
    })
    await resolve({
      dependencies: {
        first: { tag: 'v1', git: first.git },
      },
    })
    await resolve({
      dependencies: {
        first,
        second: { git: 'https://example.com/second.git' },
      },
    })
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec).toHaveBeenCalledWith('/sdk/tools/bin/cjpm', ['update', '--skip-script'], expect.objectContaining({
      throwOnError: true,
      nodePath: false,
      nodeOptions: expect.objectContaining({
        env: sdk.env,
        stdio: ['ignore', 'inherit', 'inherit'],
      }),
    }))
    const modules = await resolve({
      dependencies: { first },
    }, false)
    expect(Object.values(modules).some(module => module.name === 'first')).toBe(true)
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('changes the cache identity when a dependency version changes', async () => {
    await resolve({
      dependencies: { 'org::example': '1.0.0' },
    })
    await resolve({
      dependencies: { 'org::example': '2.0.0' },
    })
    expect(exec).toHaveBeenCalledTimes(2)
    expect(fs.existsSync(path.join(directory, 'cjslash-cache/packages/repository/source/org/example-2.0.0/cjpm.toml'))).toBe(true)
  })

  it('reuses transitive downloads from the lock file when they later appear as direct dependencies', async () => {
    const specification = { git: 'https://example.com/leaf.git', tag: 'v1' }
    vi.mocked(exec).mockImplementationOnce((...args): ReturnType<typeof exec> => {
      const result = installFixture(...args)
      const cache = path.join(directory, 'cjslash-cache/packages/git')
      writeModule('example', {
        dependencies: { leaf: specification },
      }, path.join(cache, 'example/abc123'))
      writeModule('leaf', {}, path.join(cache, 'leaf/def456'))
      fs.writeFileSync(path.join(String(args[2]?.nodeOptions?.cwd), 'cjpm.lock'), stringifyTOML({
        version: 1,
        requires: {
          example: { source: 'git+https://example.com/example.git#abc123' },
          leaf: { source: 'git+https://example.com/leaf.git#def456' },
        },
      }))
      return result
    })
    const example = { git: 'https://example.com/example.git' }
    const modules = await resolve({
      dependencies: { example },
    })
    expect(Object.values(modules).map(module => module.name)).toContain('leaf')
    await resolve({
      dependencies: { example, leaf: specification },
    })
    expect(exec).toHaveBeenCalledOnce()
  })

  it('shares a pending install between simultaneous resolutions', async () => {
    const started = Promise.withResolvers<void>()
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof exec>>>()
    vi.mocked(exec).mockImplementationOnce((...args): ReturnType<typeof exec> => {
      started.resolve()
      Promise.resolve(installFixture(...args)).then(pending.resolve)
      return pending.promise as unknown as ReturnType<typeof exec>
    })
    const overrides = {
      dependencies: {
        example: { git: 'https://example.com/example.git' },
      },
    }
    const first = resolve(overrides)
    await started.promise
    const second = resolve(overrides)
    await Promise.all([first, second])
    expect(exec).toHaveBeenCalledOnce()
  })

  it('retries a shared installation for a waiting caller when the original caller cancels', async () => {
    const started = Promise.withResolvers<void>()
    const abortController = new AbortController()
    const reason = new Error('cancel first caller')
    vi.mocked(exec).mockImplementationOnce((_command, _args, options): ReturnType<typeof exec> => {
      started.resolve()
      return new Promise((_resolve, reject): void => {
        options?.signal?.addEventListener('abort', (): void => reject(options?.signal?.reason), { once: true })
      }) as unknown as ReturnType<typeof exec>
    })
    const overrides = {
      dependencies: { example: '1.0.0' },
    }
    const first = expect(resolve(overrides, true, abortController.signal)).rejects.toBe(reason)
    await started.promise
    const second = resolve(overrides)
    abortController.abort(reason)
    const [, modules] = await Promise.all([first, second])
    expect(Object.values(modules).some(module => module.name === 'example')).toBe(true)
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('skips downloads when disabled and still reuses already downloaded source packages', async () => {
    await resolve({
      dependencies: { missing: '1.0.0' },
    }, false)
    expect(exec).not.toHaveBeenCalled()
    writeModule('cached', {}, path.join(directory, 'cjslash-cache/packages/repository/source/default/cached-1.0.0'))
    const modules = await resolve({
      dependencies: { cached: '1.0.0' },
    }, false)
    expect(Object.values(modules).some(module => module.name === 'cached')).toBe(true)
    expect(exec).not.toHaveBeenCalled()
  })

  it('does not cache a failed install and retries without rejecting the analysis', async () => {
    vi.mocked(exec).mockRejectedValueOnce(new Error('registry unavailable'))
    const overrides = {
      dependencies: { example: '1.0.0' },
    }
    const first = await resolve(overrides)
    expect(Object.values(first)[0].requires).toEqual({})
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('registry unavailable'))
    const second = await resolve(overrides)
    expect(Object.values(second).some(module => module.name === 'example')).toBe(true)
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('invalidates a cached success when the downloaded source has been removed', async () => {
    const overrides = {
      dependencies: {
        example: { git: 'https://example.com/example.git' },
      },
    }
    await resolve(overrides)
    fs.rmSync(path.join(directory, 'cjslash-cache/packages/git/example'), { recursive: true })
    await resolve(overrides)
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('reports a missing local dependency without starting CJPM or rejecting the analysis', async () => {
    const modules = await resolve({
      dependencies: {
        example: {
          path: path.join(directory, 'missing'),
        },
      },
    })
    expect(Object.values(modules)[0].requires).toEqual({})
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve dependency example'))
    expect(exec).not.toHaveBeenCalled()
  })

  it('uses replacement modules and resolves binary dependencies against the caller directory', async () => {
    const local = writeModule('local')
    const modules = await resolve({
      dependencies: { example: '1.0.0' },
      replace: {
        example: { path: local },
      },
      target: {
        custom: {
          'bin-dependencies': {
            'path-option': ['./binary'],
            'package-option': { native: './native.cjo' },
          },
        },
      },
    })
    const application = modules[URI.file(path.join(directory, 'app')).toString()]
    expect(application.requires.example.path).toBe(URI.file(local).toString())
    expect(application.package_requires).toEqual({
      path_option: [
        path.resolve('./binary'),
      ],
      package_option: {
        native: path.resolve('./native.cjo'),
      },
    })
    expect(exec).not.toHaveBeenCalled()
  })

  it('resolves relative replacement paths before passing them to CJPM in its cache workspace', async () => {
    const local = writeModule('local')
    const relative = path.relative('.', local)
    const overrides = {
      dependencies: { example: '1.0.0' },
      replace: {
        leaf: { path: relative },
      },
    }
    await resolve(overrides)
    expect(exec).toHaveBeenCalledOnce()
    const project = String(vi.mocked(exec).mock.calls[0][2]?.nodeOptions?.cwd)
    const manifest = parseTOML<CjpmToml>(fs.readFileSync(path.join(project, 'cjpm.toml'), 'utf8'))
    expect(manifest.replace).toEqual({
      leaf: { path: local },
    })
    expect(overrides.replace.leaf.path).toBe(relative)
  })

  it('loads dependencies from development and target-specific sections', async () => {
    const local = writeModule('local')
    const modules = await resolve({
      'dev-dependencies': {
        development: { path: local },
      },
      'target': {
        custom: {
          dependencies: {
            targeted: { path: local },
          },
        },
      },
    })
    expect(Object.values(modules)[0].requires).toEqual({
      development: {
        path: URI.file(local).toString(),
      },
      targeted: {
        path: URI.file(local).toString(),
      },
    })
  })

  it('propagates cancellation without printing an install failure or poisoning later requests', async () => {
    const abortController = new AbortController()
    const reason = new Error('cancel dependency installation')
    vi.mocked(exec).mockImplementationOnce((): ReturnType<typeof exec> => {
      abortController.abort(reason)
      return Promise.reject(reason) as unknown as ReturnType<typeof exec>
    })
    const overrides = {
      dependencies: { example: '1.0.0' },
    }
    await expect(resolve(overrides, true, abortController.signal)).rejects.toBe(reason)
    expect(console.warn).not.toHaveBeenCalled()
    await expect(resolve(overrides)).resolves.toBeDefined()
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('derives the CJPM executable suffix from the configured SDK instead of the host platform', async () => {
    sdk = { ...sdk, serverPath: 'C:/sdk/tools/bin/LSPServer.exe' }
    await resolve({
      dependencies: { example: '1.0.0' },
    })
    expect(vi.mocked(exec).mock.calls[0][0]).toBe('C:/sdk/tools/bin/cjpm.exe')
  })
})
