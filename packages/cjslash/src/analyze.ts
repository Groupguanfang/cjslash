import type { CjslashResult, CompletionEntry, ErrorLevel, NodeError, NodeHover, NodeWithoutPosition } from '@cjslash/protocol'
import type { Diagnostic, Hover } from 'vscode-languageserver-protocol'
import type { LspSession } from './lsp'
import type { CangjieSourceFile, ParsedSource } from './source'
import type { CjslashExecuteOptions } from './types'
import { removeCodeRanges, resolveNodePositions } from '@cjslash/protocol'
import { CompletionItemKind } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { CjslashError } from './error'
import { isRemoved } from './source'

/**
 * Text and optional documentation extracted from a hover response.
 *
 * ---
 *
 * 从 hover 响应中提取的代码文本和可选文档。
 */
interface ParsedHoverContent {
  /**
   * Code text shown by the hover response.
   *
   * ---
   *
   * hover 响应展示的代码文本。
   */
  readonly text: string

  /**
   * Supporting documentation extracted from the response.
   *
   * ---
   *
   * 从响应中提取的补充文档。
   */
  readonly docs?: string
}

/**
 * Analyze one parsed Cangjie example with an LSP session.
 *
 * ---
 *
 * 使用 LSP 会话分析一个已解析的仓颉示例。
 */
export async function analyzeSource(code: string, parsed: ParsedSource, session: LspSession, options: CjslashExecuteOptions, signal: AbortSignal): Promise<CjslashResult> {
  const { document, handbookOptions } = parsed
  const nodes: NodeWithoutPosition[] = [...parsed.nodes]
  const tokens: { start: number, length: number, file: CangjieSourceFile }[] = []
  const diagnostics: { diagnostic: Diagnostic, file: CangjieSourceFile }[] = []
  for (const file of parsed.files) {
    const analyzed = await session.update(file.content, signal, file.filename)
    diagnostics.push(...analyzed.diagnostics.map(diagnostic => ({ diagnostic, file })))
    let line = 0
    let character = 0
    for (let index = 0; index + 4 < analyzed.tokens.length; index += 5) {
      const [deltaLine, deltaCharacter, length, type] = analyzed.tokens.slice(index, index + 4)
      line += deltaLine
      character = deltaLine
        ? deltaCharacter
        : character + deltaCharacter
      if ([
        'comment',
        'keyword',
        'string',
        'number',
        'regexp',
        'operator',
      ].includes(analyzed.tokenTypes[type])) {
        continue
      }
      const start = file.document.offsetAt({ line, character })
      if (start < file.content.length && length > 0 && start + length <= file.content.length) tokens.push({ start: file.offset + start, length, file })
    }
  }

  const hovers = new Map<number, Promise<NodeHover | undefined>>()
  /**
   * Resolve and cache hover information for one source offset.
   *
   * ---
   *
   * 为指定源码偏移解析并缓存 hover 信息。
   */
  function getHover(offset: number): Promise<NodeHover | undefined> {
    const token = tokens.find(token => token.start <= offset && offset < token.start + token.length)
    const start = token?.start ?? offset
    const file = token?.file ?? parsed.files.find(file => file.offset <= offset && offset < file.offset + file.content.length)!
    let pending = hovers.get(start)
    if (!pending) {
      pending = (async () => {
        const hover = await session.hover(file.document.positionAt(start - file.offset), signal, file.filename)
        if (!hover) return undefined
        const content = parseHover(hover, options.customTags)
        if (!content.text) return undefined
        const from = hover.range
          ? file.offset + file.document.offsetAt(hover.range.start)
          : start
        const end = hover.range
          ? file.offset + file.document.offsetAt(hover.range.end)
          : start + (token?.length || 1)
        if (end <= from || isRemoved(from, parsed.removals)) return undefined
        return {
          type: 'hover' as const,
          start: from,
          length: end - from,
          ...document.positionAt(from),
          target: code.slice(from, end),
          ...content,
        }
      })()
      hovers.set(start, pending)
    }
    return pending
  }

  if (!handbookOptions.noStaticSemanticInfo) {
    for (const token of tokens) {
      if (isRemoved(token.start, parsed.removals) || options.shouldGetHoverInfo?.(code.slice(token.start, token.start + token.length), token.start, token.file.filename) === false) continue
      const hover = await getHover(token.start)
      if (hover) nodes.push(hover)
    }
  }
  for (const query of parsed.positionQueries) {
    const hover = await getHover(query)
    if (!hover) {
      const position = document.positionAt(query)
      throw new CjslashError('INVALID_QUERY', `No hover information at line ${position.line + 1}, column ${position.character + 1}.`)
    }
    nodes.push({ ...hover, type: 'query' })
  }

  for (const target of parsed.positionCompletions) {
    const file = parsed.files.find(file => file.offset <= target && target <= file.offset + file.content.length)!
    const offset = target - file.offset
    const prefix = file.content.slice(0, offset).match(/\p{ID_Continue}+$/u)?.[0] ?? ''
    const response = await session.complete(file.document.positionAt(offset), signal, file.filename)
    const items = Array.isArray(response)
      ? response
      : response?.items ?? []
    const completions: CompletionEntry[] = items
      .filter(item => !prefix || item.label.startsWith(prefix))
      .map(item => ({
        name: item.label,
        ...(item.kind === undefined
          ? {}
          : {
              kind: completionKind(item.kind),
            }),
      }))
    if (!completions.length && !handbookOptions.noErrorValidation) {
      const position = document.positionAt(target)
      throw new CjslashError('INVALID_COMPLETION', `No completions at ${file.filename}, line ${position.line + 1}, column ${position.character + 1} (prefix: ${prefix}).`)
    }
    nodes.push({
      type: 'completion',
      start: target,
      length: 0,
      completions,
      completionsPrefix: prefix || file.content[offset - 1] || '',
    })
  }

  const levels: ErrorLevel[] = [
    'error',
    'warning',
    'message',
    'suggestion',
  ]
  if (handbookOptions.noErrors !== true) {
    for (const { diagnostic, file } of diagnostics) {
      if (Array.isArray(handbookOptions.noErrors) && handbookOptions.noErrors.some(code => String(code) === String(diagnostic.code))) continue
      const start = file.offset + file.document.offsetAt(diagnostic.range.start)
      if (handbookOptions.noErrorsCutted && isRemoved(start, parsed.removals)) continue
      const end = file.offset + file.document.offsetAt(diagnostic.range.end)
      nodes.push({
        type: 'error',
        start,
        length: Math.max(0, end - start),
        code: diagnostic.code,
        level: levels[(diagnostic.severity || 1) - 1] || 'error',
        text: typeof diagnostic.message === 'string'
          ? diagnostic.message
          : diagnostic.message.value,
        filename: file.filename,
        id: `err-${diagnostic.code ?? 'unknown'}-${start}-${end - start}`,
      })
    }
  }

  const filtered = options.filterNode
    ? nodes.filter(options.filterNode)
    : nodes
  const unexpected = filtered.filter((node): node is NodeError => node.type === 'error' && (node.code === undefined || !handbookOptions.errors.some(code => String(code) === String(node.code))))
  if (!handbookOptions.noErrorValidation && unexpected.length) {
    const diagnostics = resolveNodePositions(unexpected.map(node => ({ ...node })), offset => document.positionAt(offset)) as NodeError[]
    throw new CjslashError('UNEXPECTED_DIAGNOSTIC', `Unexpected Cangjie diagnostics:\n${diagnostics.map(node => `${node.code ?? 'unknown'} at ${node.line + 1}:${node.character + 1}: ${node.text}`).join('\n')}`, { diagnostics })
  }

  const removed = handbookOptions.keepNotations
    ? { code, nodes: filtered }
    : removeCodeRanges(code, parsed.removals.map(range => [...range]), filtered)
  const outputDocument = TextDocument.create(document.uri, document.languageId, document.version, removed.code)
  const resolved = resolveNodePositions(removed.nodes, offset => outputDocument.positionAt(offset))
  const result: CjslashResult = {
    code: removed.code,
    extension: 'cj',
    nodes: resolved,
    meta: {
      extension: 'cj',
      handbookOptions,
      removals: parsed.removals,
      positionQueries: parsed.positionQueries,
      positionCompletions: parsed.positionCompletions,
      positionHighlights: parsed.positionHighlights,
    },
    /**
     * Hover nodes in this result.
     *
     * ---
     *
     * 本结果中的 hover 节点。
     */
    get hovers(): CjslashResult['hovers'] { return this.nodes.filter(node => node.type === 'hover') },
    /**
     * Query nodes in this result.
     *
     * ---
     *
     * 本结果中的查询节点。
     */
    get queries(): CjslashResult['queries'] { return this.nodes.filter(node => node.type === 'query') },
    /**
     * Error nodes in this result.
     *
     * ---
     *
     * 本结果中的错误节点。
     */
    get errors(): CjslashResult['errors'] { return this.nodes.filter(node => node.type === 'error') },
    /**
     * Highlight nodes in this result.
     *
     * ---
     *
     * 本结果中的高亮节点。
     */
    get highlights(): CjslashResult['highlights'] { return this.nodes.filter(node => node.type === 'highlight') },
    /**
     * Tag nodes in this result.
     *
     * ---
     *
     * 本结果中的标签节点。
     */
    get tags(): CjslashResult['tags'] { return this.nodes.filter(node => node.type === 'tag') },
    /**
     * Completion nodes in this result.
     *
     * ---
     *
     * 本结果中的补全节点。
     */
    get completions(): CjslashResult['completions'] { return this.nodes.filter(node => node.type === 'completion') },
  }
  return result
}

/**
 * Map LSP completion kinds to the strings used by Twoslash renderers.
 *
 * ---
 *
 * 将 LSP 补全类型映射为 Twoslash 渲染器使用的字符串。
 */
function completionKind(kind: CompletionItemKind): string | undefined {
  if (kind === CompletionItemKind.Variable) return 'var'
  if (kind === CompletionItemKind.Field) return 'property'
  if (kind === CompletionItemKind.Constructor) return 'constructor'
  if (kind === CompletionItemKind.EnumMember) return 'enum member'
  if (kind === CompletionItemKind.TypeParameter) return 'type parameter'
  return Object.entries(CompletionItemKind).find(([, value]) => value === kind)?.[0].toLowerCase()
}

/**
 * Extract code and documentation text from an LSP hover response.
 *
 * Cjslash annotations belong to the source example rather than the symbol
 * documentation returned by the language server, so they are removed from both
 * hover views.
 *
 * ---
 *
 * 从 LSP hover 响应中提取代码和文档文本。
 *
 * Cjslash 标记属于源码示例，而不是语言服务器返回的符号文档，
 * 因此会从两种 hover 内容中一并移除。
 */
function parseHover(hover: Hover, customTags: readonly string[] = []): ParsedHoverContent {
  const contents = Array.isArray(hover.contents)
    ? hover.contents
    : [hover.contents]
  const markdown = contents.map(content => typeof content === 'string'
    ? content
    : 'language' in content
      ? `\`\`\`${content.language}\n${content.value}\n\`\`\``
      : content.value).join('\n\n')
  const fences = [
    ...markdown.matchAll(/^```[^\r\n]*\r?\n([\s\S]*?)^```[ \t]*$/gm),
  ]
  if (!fences.length) {
    return {
      text: sanitizeHoverMarkdown(markdown, customTags),
    }
  }
  const text = sanitizeHoverMarkdown(fences.map(match => match[1].trimEnd()).join('\n\n'), customTags)
  const docs = sanitizeHoverMarkdown(markdown.replace(/^```[^\r\n]*\r?\n[\s\S]*?^```[ \t]*$/gm, '').replace(/^(?:Declared in|Package info):[^\r\n]*(?:\r?\n)?/gm, ''), customTags)
  return {
    text,
    ...(hasHoverDocumentation(docs)
      ? { docs }
      : {}),
  }
}

/**
 * Annotation names that configure one Cjslash analysis without documenting the
 * hovered symbol.
 *
 * ---
 *
 * 仅配置 Cjslash 分析、不描述悬浮符号的标记名称。
 */
const CJSLASH_HOVER_FLAGS: ReadonlySet<string> = new Set([
  'errors',
  'filename',
  'keepNotations',
  'noErrors',
  'noErrorsCutted',
  'noErrorValidation',
  'noStaticSemanticInfo',
])

/**
 * Manifest sections that can be overridden by Cjslash source annotations.
 *
 * ---
 *
 * 可由 Cjslash 源码标记覆盖的清单节。
 */
const CJSLASH_HOVER_SECTIONS: readonly string[] = [
  'bin-dependencies',
  'dependencies',
  'dev-dependencies',
  'feature',
  'ffi',
  'package',
  'profile',
  'replace',
  'script-dependencies',
  'source-set',
  'target',
  'test-dependencies',
]

/**
 * Check whether a hover line is a Cjslash notation rather than documentation.
 *
 * ---
 *
 * 判断一行 hover 内容是否属于 Cjslash 标记而非文档。
 */
function isCjslashHoverNotation(line: string, customTags: readonly string[]): boolean {
  const text = line.trim().replace(/^\/\/\s*/, '')
  if (/^---cut(?:-before|-after|-start|-end)?---$/.test(text)) return true
  if (/^\^\?(?:\s|$)/.test(text) || /^\^\|(?:\s|$)/.test(text) || /^\^{2,}(?:\s|$)/.test(text)) return true
  if (!text.startsWith('@')) return false
  const name = text.slice(1).split(/[:\s]/, 1)[0]
  if (CJSLASH_HOVER_FLAGS.has(name) || customTags.includes(name)) return true
  return CJSLASH_HOVER_SECTIONS.some(section => name === section || name.startsWith(`${section}.`))
}

/**
 * Remove Cjslash notation lines while preserving ordinary Markdown documentation.
 *
 * ---
 *
 * 移除 Cjslash 标记行，同时保留普通 Markdown 文档。
 */
function sanitizeHoverMarkdown(markdown: string, customTags: readonly string[]): string {
  return markdown
    .split(/\r?\n/)
    .filter(line => !isCjslashHoverNotation(line, customTags))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Check whether cleaned hover content still contains meaningful documentation.
 *
 * Standalone horizontal rules only separate the signature from documentation and
 * are discarded when no documentation remains.
 *
 * ---
 *
 * 判断清理后的 hover 内容是否仍有有效文档。
 *
 * 独立水平线仅用于分隔签名与文档；没有文档时会被丢弃。
 */
function hasHoverDocumentation(markdown: string): boolean {
  return markdown.split(/\r?\n/).some((line) => {
    const text = line.trim()
    return !!text && !/^-{2,}$/.test(text)
  })
}
