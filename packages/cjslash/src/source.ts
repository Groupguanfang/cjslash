import type { CjslashDiagnosticCode, CjslashHandbookOptions, CjslashResultMeta, NodeWithoutPosition, Range } from '@cjslash/protocol'
import type { CangjiePackageInfo } from './package'
import type { CjpmToml, CjslashExecuteOptions } from './types'
import { mergeRanges } from '@cjslash/protocol'
import { parseTOML } from 'confbox/toml'
import path from 'pathe'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { mergeCjpmToml } from './cjpm'
import { CjslashError } from './error'
import { resolveCangjiePackage, skipTrivia } from './package'

/**
 * One virtual Cangjie source file with coordinates in the original example.
 *
 * ---
 *
 * 一个仓颉虚拟源文件，包含其在原始示例中的坐标。
 */
export interface CangjieSourceFile {
  /**
   * Normalized relative filename from `@filename`, or `index.cj`.
   *
   * ---
   *
   * `@filename` 指定的规范化相对文件名，默认为 `index.cj`。
   */
  readonly filename: string

  /**
   * UTF-16 offset of this file's content in the original input.
   *
   * ---
   *
   * 文件内容在原始输入中的 UTF-16 偏移。
   */
  readonly offset: number

  /**
   * Original file content, including its analysis annotations.
   *
   * ---
   *
   * 原始文件内容，包含其中的分析标记。
   */
  readonly content: string

  /**
   * Package declaration and the corresponding project source path.
   *
   * ---
   *
   * 包声明及其对应的工程源文件路径。
   */
  readonly packageInfo: CangjiePackageInfo

  /**
   * Text document converting file-local UTF-16 positions.
   *
   * ---
   *
   * 用于换算文件内部 UTF-16 位置的文本文档。
   */
  readonly document: TextDocument
}

/**
 * Parsed source code and notation metadata for one analysis.
 *
 * ---
 *
 * 单次分析中解析后的源码和标记元数据。
 */
export interface ParsedSource {
  /**
   * Manifest overrides after applying execution settings and source annotations.
   *
   * ---
   *
   * 应用执行配置和源码注释后的工程清单覆盖项。
   */
  readonly cjpmToml: CjpmToml

  /**
   * Source files sharing one temporary Cangjie module.
   *
   * ---
   *
   * 共享同一个临时仓颉模块的源文件。
   */
  readonly files: CangjieSourceFile[]

  /**
   * Resolved handbook options.
   *
   * ---
   *
   * 解析后的完整 handbook 配置。
   */
  readonly handbookOptions: CjslashHandbookOptions

  /**
   * Half-open ranges removed from the displayed source.
   *
   * ---
   *
   * 从展示源码中移除的左闭右开区间。
   */
  readonly removals: Range[]

  /**
   * Explicit query offsets in the original input.
   *
   * ---
   *
   * 原始输入中的显式查询偏移。
   */
  readonly positionQueries: number[]

  /**
   * Completion cursor offsets in the original input.
   *
   * ---
   *
   * 补全光标在原始输入中的偏移。
   */
  readonly positionCompletions: number[]

  /**
   * Highlight ranges in the original input.
   *
   * ---
   *
   * 原始输入中的高亮区间。
   */
  readonly positionHighlights: CjslashResultMeta['positionHighlights']

  /**
   * Nodes discovered while parsing notation.
   *
   * ---
   *
   * 解析标记时发现的节点。
   */
  readonly nodes: NodeWithoutPosition[]

  /**
   * Text document used for offset and position conversion.
   *
   * ---
   *
   * 用于偏移和位置换算的文本文档。
   */
  readonly document: TextDocument
}

/**
 * Merge handbook overrides with defaults and clone caller-owned arrays.
 *
 * ---
 *
 * 将 handbook 覆盖项与默认值合并，并复制调用方持有的数组。
 */
export function resolveHandbookOptions(options?: Partial<CjslashHandbookOptions>): CjslashHandbookOptions {
  const handbookOptions: CjslashHandbookOptions = {
    errors: [],
    noErrors: false,
    noErrorValidation: false,
    noStaticSemanticInfo: false,
    keepNotations: false,
    noErrorsCutted: false,
    ...options,
  }
  handbookOptions.errors = [...handbookOptions.errors]
  if (Array.isArray(handbookOptions.noErrors)) handbookOptions.noErrors = [...handbookOptions.noErrors]
  return handbookOptions
}

/**
 * Parse Cangjie example source and its notation markers.
 *
 * ---
 *
 * 解析仓颉示例源码及其标记。
 */
export function parseSource(code: string, options: CjslashExecuteOptions): ParsedSource {
  const handbookOptions = resolveHandbookOptions(options.handbookOptions)
  let cjpmToml = mergeCjpmToml(options.cjpmToml)
  const document = TextDocument.create('cjslash:///index.cj', 'cangjie', 1, code)
  const comments = findLineComments(document)
  const markerLines = new Set<number>()
  const queries = [
    ...(options.positionQueries || []),
  ]
  const completions = [
    ...(options.positionCompletions || []),
  ]
  const boundaries = [
    { filename: 'index.cj', offset: 0, end: code.length },
  ]
  const highlights: CjslashResultMeta['positionHighlights'] = (options.positionHighlights || []).map(range => [...range])
  const nodes: NodeWithoutPosition[] = []
  const notationRemovals: Range[] = []
  let cutRemovals: Range[] = []
  const cutStarts: number[] = []

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
    const range = document.getLineRange(lineIndex)
    const line = document.getText(range)
    const start = document.offsetAt(range.start)
    const trimmed = line.trim()
    const commentStart = start + line.indexOf('//')
    if (!trimmed.startsWith('//') || !comments.has(commentStart)) continue
    const end = document.offsetAt({ line: lineIndex + 1, character: 0 })
    const cut = trimmed.match(/^\/\/\s?---(cut(?:-before|-after|-start|-end)?)---$/)?.[1]
    if (cut) {
      if (cut === 'cut' || cut === 'cut-before') {
        cutRemovals = [
          [0, end],
        ]
      }
      else if (cut === 'cut-after') {
        cutRemovals.push([start, code.length])
      }
      else if (cut === 'cut-start') {
        cutStarts.push(start)
      }
      else {
        const opening = cutStarts.pop()
        if (opening === undefined) throw new CjslashError('INVALID_NOTATION', `Unmatched cut-end on line ${lineIndex + 1}.`)
        cutRemovals.push([opening, end])
      }
      continue
    }

    const marker = line.trimEnd().match(/^\s*\/\/\s*(\^\?|\^\||\^{2,})(?:[ \t]+(\S.*))?$/)
    if (marker) {
      const errorCode = marker[1] === '^|'
        ? 'INVALID_COMPLETION'
        : 'INVALID_QUERY'
      let targetLine = lineIndex - 1
      while (markerLines.has(targetLine))
        targetLine--
      const character = line.indexOf('^')
      if (targetLine < 0 || character > document.getLineRange(targetLine).end.character) throw new CjslashError(errorCode, `The marker on line ${lineIndex + 1} does not point into the preceding code line.`)
      const target = document.offsetAt({ line: targetLine, character })
      if (target < boundaries.at(-1)!.offset) throw new CjslashError(errorCode, `The marker on line ${lineIndex + 1} points outside its source file.`)
      if (marker[1] === '^?') {
        queries.push(target)
      }
      else if (marker[1] === '^|') {
        completions.push(target)
      }
      else {
        highlights.push([
          target,
          target + marker[1].length,
          marker[2]?.trim(),
        ])
      }
      notationRemovals.push([start, end])
      markerLines.add(lineIndex)
      continue
    }

    const flag = trimmed.match(/^\/\/\s?@((?:"[^"]*"|'[^']*'|[^\s:'"])+)(?::(.*))?$/)
    if (!flag) continue
    const name = flag[1]
    const value = flag[2]?.trim()
    if (name === 'filename') {
      if (!value || /^[\\/]|^[a-z]:/i.test(value) || value.includes('\0') || value.split(/[\\/]/).includes('..') || path.extname(value) !== '.cj') throw new CjslashError('INVALID_NOTATION', '@filename requires a relative .cj path without parent directory traversal.')
      const previous = boundaries.at(-1)!
      previous.end = start
      if (boundaries.length === 1 && previous.offset === 0 && skipTrivia(code.slice(0, start), 0) >= start) boundaries.pop()
      boundaries.push({
        filename: path.normalize(value),
        offset: end,
        end: code.length,
      })
      continue
    }
    else if (options.customTags?.includes(name)) {
      nodes.push({
        type: 'tag',
        name,
        text: value,
        start: end,
        length: 0,
      })
    }
    else if (name === 'errors') {
      handbookOptions.errors = parseDiagnosticCodes(value, name)
    }
    else if (name === 'noErrors') {
      handbookOptions.noErrors = value === undefined || value === 'true'
        ? true
        : value === 'false'
          ? false
          : parseDiagnosticCodes(value, name)
    }
    else if ([
      'noErrorValidation',
      'noStaticSemanticInfo',
      'keepNotations',
      'noErrorsCutted',
    ].includes(name)) {
      if (value !== undefined && value !== 'true' && value !== 'false') throw new CjslashError('INVALID_NOTATION', `@${name} requires true or false.`)
      const key = name as 'noErrorValidation' | 'noStaticSemanticInfo' | 'keepNotations' | 'noErrorsCutted'
      handbookOptions[key] = value !== 'false'
    }
    else if (/^(?:package|dependencies|test-dependencies|dev-dependencies|script-dependencies|bin-dependencies|target|ffi|profile|replace|feature|source-set)(?:\.|$)/.test(name)) {
      try {
        cjpmToml = mergeCjpmToml(cjpmToml, parseTOML<CjpmToml>(`${name} = ${value ?? 'true'}`))
      }
      catch (cause) {
        throw new CjslashError('INVALID_CJPM_TOML', `Invalid cjpm.toml override @${name} on line ${lineIndex + 1}. Use a TOML value after the colon.`, { cause })
      }
    }
    else {
      throw new CjslashError('UNSUPPORTED_FEATURE', `Unsupported annotation @${name}. Register custom tags with customTags.`)
    }
    notationRemovals.push([start, end])
  }

  if (cutStarts.length) throw new CjslashError('INVALID_NOTATION', 'Every cut-start must have a matching cut-end.')

  const removals = mergeRanges([
    ...notationRemovals,
    ...cutRemovals,
  ])
  for (const query of queries) {
    if (!Number.isInteger(query) || query < 0 || query >= code.length || isRemoved(query, removals)) throw new CjslashError('INVALID_QUERY', `Query offset ${query} is outside visible source code.`)
  }
  for (const completion of completions) {
    if (!Number.isInteger(completion) || completion < 0 || completion > code.length || isRemoved(completion, removals)) throw new CjslashError('INVALID_COMPLETION', `Completion offset ${completion} is outside visible source code.`)
  }
  const files: CangjieSourceFile[] = boundaries.map(({ filename, offset, end }) => {
    const content = code.slice(offset, end)
    return {
      filename,
      offset,
      content,
      packageInfo: resolveCangjiePackage(content, filename),
      document: TextDocument.create(URI.from({ scheme: 'cjslash', path: `/${filename}` }).toString(), 'cangjie', 1, content),
    }
  })
  const filenames = new Set<string>()
  const sourcePaths = new Set<string>()
  for (const file of files) {
    if (filenames.has(file.filename) || sourcePaths.has(file.packageInfo.sourcePath)) throw new CjslashError('INVALID_NOTATION', `Duplicate source file: ${file.filename}.`)
    if (file.packageInfo.moduleName !== files[0].packageInfo.moduleName) throw new CjslashError('INVALID_NOTATION', 'All @filename files must belong to the same root module. Declare the same root package in each file.')
    filenames.add(file.filename)
    sourcePaths.add(file.packageInfo.sourcePath)
  }
  for (const offset of queries) {
    if (!files.some(file => file.offset <= offset && offset < file.offset + file.content.length)) throw new CjslashError('INVALID_QUERY', `Query offset ${offset} is outside a source file.`)
  }
  for (const offset of completions) {
    if (!files.some(file => file.offset <= offset && offset <= file.offset + file.content.length)) throw new CjslashError('INVALID_COMPLETION', `Completion offset ${offset} is outside a source file.`)
  }
  for (const [start, end, text] of highlights) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > code.length) throw new CjslashError('INVALID_NOTATION', `Invalid highlight range [${start}, ${end}).`)
    nodes.push({
      type: 'highlight',
      start,
      length: end - start,
      text,
    })
  }

  return {
    cjpmToml,
    files,
    handbookOptions,
    removals,
    positionQueries: [
      ...new Set(queries),
    ],
    positionCompletions: [
      ...new Set(completions),
    ],
    positionHighlights: highlights,
    nodes,
    document,
  }
}

/**
 * Check whether an offset falls inside any removed range.
 *
 * ---
 *
 * 判断偏移是否位于任意移除区间内。
 */
export function isRemoved(offset: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => start <= offset && offset < end)
}

/**
 * Parse the diagnostic codes listed by an `@errors` or `@noErrors` marker.
 *
 * ---
 *
 * 解析 `@errors` 或 `@noErrors` 标记中列出的诊断编号。
 */
function parseDiagnosticCodes(value: string | undefined, name: string): CjslashDiagnosticCode[] {
  if (value === undefined) throw new CjslashError('INVALID_NOTATION', `@${name} requires a colon and a list of diagnostic codes.`)
  return value.split(/\s+/).filter(Boolean).map(code => String(Number(code)) === code
    ? Number(code)
    : code)
}

/**
 * Find line-comment offsets while skipping comments inside strings and block comments.
 *
 * ---
 *
 * 查找行注释偏移，同时跳过字符串和块注释中的内容。
 */
function findLineComments(document: TextDocument): Set<number> {
  const code = document.getText()
  const comments = new Set<number>()
  let index = 0
  while (index < code.length) {
    if (code.startsWith('//', index)) {
      comments.add(index)
      index = document.offsetAt({ line: document.positionAt(index).line + 1, character: 0 })
    }
    else if (code.startsWith('/*', index)) {
      let depth = 1
      index += 2
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
    }
    else if (code[index] === '"' || code[index] === '\'') {
      const quote = code[index]
      let hashes = 0
      while (code[index - hashes - 1] === '#')
        hashes++
      const delimiter = code.startsWith(quote.repeat(3), index)
        ? quote.repeat(3)
        : quote
      const ending = delimiter + '#'.repeat(hashes)
      index += delimiter.length
      while (index < code.length && !code.startsWith(ending, index)) {
        index += code[index] === '\\' && !hashes
          ? 2
          : 1
      }
      index += ending.length
    }
    else {
      index++
    }
  }
  return comments
}
