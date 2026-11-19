import type { CjpmToml } from '../src/types'
import { parseTOML } from 'confbox/toml'
import { mergeCjpmToml, resolveCjpmToml } from '../src/cjpm'

describe('cjpm.toml resolution', () => {
  it('merges nested dependency fields and replaces arrays without modifying the inputs', () => {
    const defaults: CjpmToml = {
      'dependencies': {
        example: { git: 'https://example.com/example.git', tag: 'v1' },
      },
      'bin-dependencies': {
        'path-option': ['./old'],
      },
    }
    const snapshot = structuredClone(defaults)
    const merged = mergeCjpmToml(defaults, {
      'dependencies': {
        example: { tag: 'v2' },
      },
      'bin-dependencies': {
        'path-option': ['./new'],
      },
    })
    expect(merged).toEqual({
      'dependencies': {
        example: { git: 'https://example.com/example.git', tag: 'v2' },
      },
      'bin-dependencies': {
        'path-option': ['./new'],
      },
    })
    expect(defaults).toEqual(snapshot)
    expect(merged['bin-dependencies']).not.toBe(defaults['bin-dependencies'])
  })

  it('serializes the default single-file project manifest', () => {
    const parsed = parseTOML(resolveCjpmToml('1.2.1')) as {
      package: Record<string, string>
    }
    expect(parsed.package).toEqual({
      'cjc-version': '1.2.1',
      'name': 'default',
      'version': '0.1.0',
      'output-type': 'static',
      'src-dir': 'src',
    })
  })

  it('uses the default manifest for an empty configuration object', () => {
    expect(resolveCjpmToml('1.2.1', {})).toBe(resolveCjpmToml('1.2.1'))
  })

  it('merges package fields and additional tables while preserving the module name', () => {
    const overrides = Object.freeze({
      package: Object.freeze({ name: 'custom', version: '9.9.9' }),
      dependencies: Object.freeze({
        stdx: Object.freeze({ path: './vendor/stdx' }),
      }),
    })
    const parsed = parseTOML(resolveCjpmToml('1.2.1', overrides, 'example')) as {
      package: Record<string, string>
      dependencies: Record<string, { path: string }>
    }
    expect(parsed.package).toEqual({
      'cjc-version': '1.2.1',
      'name': 'example',
      'version': '9.9.9',
      'output-type': 'static',
      'src-dir': 'src',
    })
    expect(parsed.dependencies).toEqual({
      stdx: { path: './vendor/stdx' },
    })
    expect(overrides.package).toEqual({ name: 'custom', version: '9.9.9' })
  })

  it('keeps the default package table when overrides only add another table', () => {
    const parsed = parseTOML(resolveCjpmToml('1.2.1', {
      dependencies: { stdx: '1.0.0' },
    })) as {
      package: Record<string, string>
      dependencies: Record<string, string>
    }
    expect(parsed.package['cjc-version']).toBe('1.2.1')
    expect(parsed.dependencies).toEqual({ stdx: '1.0.0' })
  })

  it('preserves serialization failures as the cause of INVALID_CJPM_TOML', () => {
    const overrides: CjpmToml = {}
    overrides.dependencies = overrides
    expect(() => resolveCjpmToml('1.2.1', overrides)).toThrowError(expect.objectContaining({
      name: 'CjslashError',
      code: 'INVALID_CJPM_TOML',
      cause: expect.any(Error),
    }))
  })

  it.each([
    '[dependencies]',
    null,
    [],
    new Date(0),
  ])('rejects a configuration that is not a table object: %j', (overrides) => {
    expect(() => resolveCjpmToml('1.2.1', overrides as never)).toThrowError(expect.objectContaining({
      code: 'INVALID_CJPM_TOML',
    }))
  })

  it.each([
    'wrong',
    ['wrong'],
    null,
  ])('rejects a non-table package value: %j', (value) => {
    expect(() => resolveCjpmToml('1.2.1', { package: value } as never)).toThrowError(expect.objectContaining({
      code: 'INVALID_CJPM_TOML',
    }))
  })
})
