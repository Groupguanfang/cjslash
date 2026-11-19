import path from 'pathe'
import { CjslashError } from './error'

const PACKAGE_NAME = /^(?:\p{ID_Start}|_)\p{ID_Continue}*(?:\.(?:\p{ID_Start}|_)\p{ID_Continue}*)*/u

/**
 * Cangjie package metadata derived from a source file.
 *
 * ---
 *
 * 从源文件推导出的仓颉包元数据。
 */
export interface CangjiePackageInfo {
  /**
   * Fully qualified package name.
   *
   * ---
   *
   * 完整包名。
   */
  readonly name: string

  /**
   * Root module name used by `cjpm.toml`.
   *
   * ---
   *
   * `cjpm.toml` 使用的根模块名。
   */
  readonly moduleName: string

  /**
   * Source file path relative to the temporary project root.
   *
   * ---
   *
   * 相对于临时工程根目录的源文件路径。
   */
  readonly sourcePath: string
}

/**
 * Resolve package metadata from the top-level declaration in one source file.
 *
 * Files without a package declaration use the `default` package.
 * A bare filename inherits the package directory; an explicit directory must match it.
 *
 * ---
 *
 * 从单个源文件顶部的声明解析包元数据。
 *
 * 未声明包的文件使用 `default` 包。
 * 仅指定文件名时继承包目录，显式指定的目录必须与包路径一致。
 */
export function resolveCangjiePackage(code: string, filename = 'index.cj'): CangjiePackageInfo {
  const name = readPackageName(code) ?? 'default'
  const [moduleName, ...packagePath] = name.split('.')
  const directory = packagePath.join('/')
  if (path.dirname(filename) !== '.' && path.dirname(filename) !== directory) throw new CjslashError('INVALID_NOTATION', `The path of ${filename} must match package ${name}, or use a bare filename.`)
  return {
    name,
    moduleName,
    sourcePath: path.join('src', directory, path.basename(filename)),
  }
}

/**
 * Read the first package declaration after leading whitespace and comments.
 *
 * ---
 *
 * 读取前导空白和注释后的第一个包声明。
 */
function readPackageName(code: string): string | undefined {
  const start = skipTrivia(code, code.startsWith('\uFEFF')
    ? 1
    : 0)
  if (!code.startsWith('package', start)) return undefined
  const afterKeyword = start + 'package'.length
  if (afterKeyword < code.length && !isWhitespace(code[afterKeyword])) return undefined
  const nameStart = skipWhitespace(code, afterKeyword)
  const match = PACKAGE_NAME.exec(code.slice(nameStart))
  if (!match) throw new CjslashError('INVALID_NOTATION', 'Invalid package declaration. Package names must be dot-separated identifiers.')
  return match[0]
}

/**
 * Skip whitespace and nested comments before the first source token.
 *
 * ---
 *
 * 跳过首个源码标记之前的空白和嵌套注释。
 */
export function skipTrivia(code: string, start: number): number {
  let index = start
  while (index < code.length) {
    index = skipWhitespace(code, index)
    if (code.startsWith('//', index)) {
      const lineEnd = code.indexOf('\n', index + 2)
      index = lineEnd === -1
        ? code.length
        : lineEnd + 1
      continue
    }
    if (code.startsWith('/*', index)) {
      index = skipBlockComment(code, index)
      continue
    }
    break
  }
  return index
}

/**
 * Skip whitespace characters from one offset.
 *
 * ---
 *
 * 从指定偏移跳过空白字符。
 */
function skipWhitespace(code: string, start: number): number {
  let index = start
  while (index < code.length && isWhitespace(code[index]))
    index++
  return index
}

/**
 * Skip one nested block comment.
 *
 * ---
 *
 * 跳过一个可嵌套的块注释。
 */
function skipBlockComment(code: string, start: number): number {
  let index = start + 2
  let depth = 1
  while (index < code.length && depth) {
    if (code.startsWith('/*', index)) {
      depth++
      index += 2
    }
    else if (code.startsWith('*/', index)) {
      depth--
      index += 2
    }
    else {
      index++
    }
  }
  return index
}

/**
 * Check whether one character is source whitespace.
 *
 * ---
 *
 * 判断单个字符是否为源码空白。
 */
function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character)
}
