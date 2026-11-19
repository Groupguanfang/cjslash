import fs from 'node:fs'
import { resolveSdk } from '../src/sdk'

const mocks = vi.hoisted(() => ({
  realpathSync: vi.fn(),
  accessSync: vi.fn(),
  execSync: vi.fn(),
  process: {
    platform: 'darwin',
    arch: 'arm64',
    env: {} as NodeJS.ProcessEnv,
  },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    default: { constants: actual.constants, realpathSync: mocks.realpathSync, accessSync: mocks.accessSync },
  }
})
vi.mock('node:process', () => ({ default: mocks.process }))
vi.mock('tinyexec', () => ({ execSync: mocks.execSync }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.process.platform = 'darwin'
  mocks.process.arch = 'arm64'
  mocks.process.env = { PATH: '/usr/bin', DYLD_FALLBACK_LIBRARY_PATH: '/existing/lib', KEEP: 'value' }
  mocks.realpathSync.mockReturnValue('/real/cangjie')
  mocks.accessSync.mockReturnValue(undefined)
  mocks.execSync.mockReturnValue({ stdout: 'Cangjie Compiler: 1.2.1 (cjnative)\n', stderr: '' })
})

describe('sdk resolution', () => {
  it.each(['', ' ', '\n\t'])('rejects an empty SDK path %j', async (sdkPath) => {
    await expect(resolveSdk(sdkPath, 1000)).rejects.toMatchObject({ code: 'SDK_NOT_FOUND' })
    expect(fs.realpathSync).not.toHaveBeenCalled()
  })

  it('resolves symbolic paths and checks executable permissions', async () => {
    const sdk = await resolveSdk('./sdk', 1234)
    expect(fs.realpathSync).toHaveBeenCalledWith('./sdk')
    expect(fs.accessSync).toHaveBeenCalledWith('/real/cangjie/bin/cjc', fs.constants.X_OK)
    expect(fs.accessSync).toHaveBeenCalledWith('/real/cangjie/tools/bin/LSPServer', fs.constants.X_OK)
    expect(sdk.root).toBe('/real/cangjie')
    expect(sdk.version).toBe('1.2.1')
    expect(sdk.serverPath).toBe('/real/cangjie/tools/bin/LSPServer')
    expect(mocks.execSync).toHaveBeenCalledWith('/real/cangjie/bin/cjc', ['-v'], {
      timeout: 1234,
      throwOnError: true,
      nodePath: false,
      nodeOptions: { env: sdk.env },
    })
  })

  it('prepends macOS SDK paths without modifying the parent environment', async () => {
    const original = { ...mocks.process.env }
    const sdk = await resolveSdk('./sdk', 1000, 'darwin', 'arm64')
    expect(sdk.env).toMatchObject({
      CANGJIE_HOME: '/real/cangjie',
      PATH: '/real/cangjie/bin:/real/cangjie/tools/bin:/usr/bin',
      DYLD_FALLBACK_LIBRARY_PATH: '/real/cangjie/runtime/lib/darwin_aarch64_cjnative:/real/cangjie/tools/lib:/existing/lib',
      KEEP: 'value',
    })
    expect(mocks.process.env).toEqual(original)
    expect(sdk.env).not.toBe(mocks.process.env)
  })

  it.each([
    ['linux', 'x64', 'linux_x86_64_cjnative'],
    ['linux', 'arm64', 'linux_aarch64_cjnative'],
    ['linux', 'riscv64', 'linux_riscv64_cjnative'],
  ])('configures %s/%s runtime libraries', async (platform, architecture, runtime) => {
    mocks.process.env = { PATH: '/usr/bin', LD_LIBRARY_PATH: '/existing/linux' }
    const sdk = await resolveSdk('./sdk', 1000, platform as NodeJS.Platform, architecture as NodeJS.Architecture)
    expect(sdk.env.LD_LIBRARY_PATH).toBe(`/real/cangjie/runtime/lib/${runtime}:/real/cangjie/tools/lib:/existing/linux`)
    expect(sdk.env.DYLD_FALLBACK_LIBRARY_PATH).toBeUndefined()
  })

  it('configures Windows executables, case-insensitive Path, and DLL search paths', async () => {
    mocks.process.env = { Path: 'C:\\Windows\\System32' }
    mocks.realpathSync.mockReturnValue('C:\\cangjie')
    const sdk = await resolveSdk('C:\\sdk', 1000, 'win32', 'x64')
    expect(fs.accessSync).toHaveBeenCalledWith('C:/cangjie/bin/cjc.exe', fs.constants.F_OK)
    expect(fs.accessSync).toHaveBeenCalledWith('C:/cangjie/tools/bin/LSPServer.exe', fs.constants.F_OK)
    expect(sdk.env.Path).toBe([
      'C:/cangjie/bin',
      'C:/cangjie/tools/bin',
      'C:/cangjie/runtime/lib/windows_x86_64_cjnative',
      'C:/cangjie/tools/lib',
      'C:\\Windows\\System32',
    ].join(';'))
    expect(sdk.env.PATH).toBeUndefined()
    expect(sdk.env.LD_LIBRARY_PATH).toBeUndefined()
    expect(sdk.serverPath).toBe('C:/cangjie/tools/bin/LSPServer.exe')
    expect(mocks.execSync.mock.calls[0][0]).toBe('C:/cangjie/bin/cjc.exe')
  })

  it('creates search paths when the parent environment does not define them', async () => {
    mocks.process.env = {}
    const sdk = await resolveSdk('./sdk', 1000)
    expect(sdk.env.PATH).toBe('/real/cangjie/bin:/real/cangjie/tools/bin')
    expect(sdk.env.DYLD_FALLBACK_LIBRARY_PATH).toBe('/real/cangjie/runtime/lib/darwin_aarch64_cjnative:/real/cangjie/tools/lib')
  })

  it.each(['realpathSync', 'accessSync'] as const)('preserves %s failures as SDK_NOT_FOUND causes', async (operation) => {
    const cause = new Error('permission denied')
    mocks[operation].mockImplementationOnce(() => {
      throw cause
    })
    await expect(resolveSdk('./sdk', 1000)).rejects.toMatchObject({ name: 'CjslashError', code: 'SDK_NOT_FOUND', cause })
    expect(mocks.execSync).not.toHaveBeenCalled()
  })

  it('accepts a compiler version written to stderr', async () => {
    mocks.execSync.mockReturnValue({ stdout: '', stderr: 'Cangjie Compiler: 1.3.0\n' })
    expect((await resolveSdk('./sdk', 1000)).version).toBe('1.3.0')
  })

  it.each([
    { stdout: 'unknown compiler', stderr: '' },
    { stdout: 'Cangjie Compiler: invalid', stderr: '' },
  ])('rejects an unrecognized compiler version: %j', async (output) => {
    mocks.execSync.mockReturnValue(output)
    await expect(resolveSdk('./sdk', 1000)).rejects.toMatchObject({
      code: 'SDK_INVALID',
      cause: expect.any(Error),
    })
  })

  it('preserves compiler execution failures as SDK_INVALID causes', async () => {
    const cause = new Error('compiler execution timed out')
    mocks.execSync.mockImplementation(() => {
      throw cause
    })
    await expect(resolveSdk('./sdk', 1000)).rejects.toMatchObject({ code: 'SDK_INVALID', cause })
  })
})
