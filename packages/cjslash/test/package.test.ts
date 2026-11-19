import { resolveCangjiePackage } from '../src/package'

describe('cangjie package resolution', () => {
  it('uses the default package when no declaration exists', () => {
    expect(resolveCangjiePackage('main() {}')).toEqual({
      name: 'default',
      moduleName: 'default',
      sourcePath: 'src/index.cj',
    })
  })

  it.each([
    [
      'package example\nmain() {}',
      'example',
      'example',
      'src/index.cj',
    ],
    [
      'package example.models\nmain() {}',
      'example.models',
      'example',
      'src/models/index.cj',
    ],
    [
      'package example.models.user\nmain() {}',
      'example.models.user',
      'example',
      'src/models/user/index.cj',
    ],
  ])('maps %j to its module and source path', (code, name, moduleName, sourcePath) => {
    expect(resolveCangjiePackage(code)).toEqual({
      name,
      moduleName,
      sourcePath,
    })
  })

  it('reads the declaration after a BOM, comments, and whitespace', () => {
    const code = '\uFEFF\n// heading\n/* outer /* nested */ comment */\r\n  package example.models\nmain() {}'
    expect(resolveCangjiePackage(code)).toMatchObject({
      name: 'example.models',
      moduleName: 'example',
      sourcePath: 'src/models/index.cj',
    })
  })

  it('ignores package-like text outside the declaration position', () => {
    expect(resolveCangjiePackage('import package.example\nmain() {}')).toMatchObject({
      name: 'default',
      sourcePath: 'src/index.cj',
    })
    expect(resolveCangjiePackage('// package hidden\nmain() {}')).toMatchObject({
      name: 'default',
    })
  })

  it('rejects a package keyword without a valid name', () => {
    expect(() => resolveCangjiePackage('package .invalid\nmain() {}')).toThrow(expect.objectContaining({
      name: 'CjslashError',
      code: 'INVALID_NOTATION',
    }))
  })
})
