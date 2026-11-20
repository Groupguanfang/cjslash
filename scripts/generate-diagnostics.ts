import childProcess from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'
import { URI, Utils } from 'vscode-uri'

/**
 * A diagnostic read from the SDK's original or refactored message tables.
 *
 * ---
 *
 * 从 SDK 原始消息表或重构消息表读取的诊断。
 */
interface RawDiagnostic {
  code: number
  name: string
  severity: number
  message: string
  mainHint: string
  otherHints: string[]
  table: 'original' | 'refactored'
}

/**
 * A documentation entry retaining the SDK's name, templates, category, and level.
 *
 * ---
 *
 * 保留 SDK 诊断名称、模板、分类与级别的文档条目。
 */
interface DiagnosticEntry extends Omit<RawDiagnostic, 'severity' | 'table'> {
  category: string
  level: 'error' | 'warning' | 'note' | 'hint'
}

const sdkPath = process.argv[2] || process.env.CJSLASH_SDK_PATH || process.env.CANGJIE_HOME
if (!sdkPath) throw new Error('Pass a macOS Cangjie SDK path or set CJSLASH_SDK_PATH.')
const sdkRoot = URI.file(fs.realpathSync(sdkPath))
const directory = Utils.dirname(URI.parse(import.meta.url))
const compiler = childProcess.execFileSync(Utils.resolvePath(sdkRoot, 'bin/cjc').fsPath, ['-v'], { encoding: 'utf8' })
const version = compiler.match(/Cangjie Compiler:\s*(\d+\.\d+\.\d+)/)?.[1]
const target = compiler.match(/Target:\s*(\S+)/)?.[1]
if (version !== '1.2.1' || target !== 'aarch64-apple-darwin') {
  throw new Error('Diagnostic extraction is verified for Cangjie SDK 1.2.1 on aarch64-apple-darwin.')
}
const library = 'tools/lib/libcangjie-lsp.dylib'
const libraryPath = Utils.resolvePath(sdkRoot, library).fsPath
fs.accessSync(libraryPath, fs.constants.R_OK)
await using subscriptions = new AsyncDisposableStack()
const temporaryDirectory = fs.mkdtempSync(Utils.resolvePath(directory, '.diagnostics-').fsPath)
subscriptions.defer((): void => fs.rmSync(temporaryDirectory, { recursive: true, force: true }))
const executable = Utils.resolvePath(URI.file(temporaryDirectory), 'extract-diagnostics').fsPath
childProcess.execFileSync('clang++', [
  '-std=c++17',
  Utils.resolvePath(directory, 'extract-diagnostics.cpp').fsPath,
  '-o',
  executable,
])
const extraction = childProcess.execFileSync(executable, [libraryPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
const rawDiagnostics = JSON.parse(extraction) as RawDiagnostic[]
const diagnostics: DiagnosticEntry[] = []
const levels = ['error', 'warning', 'note', 'hint'] as const
let category = ''
let excludedBoundaries = 0
for (const diagnostic of rawDiagnostics) {
  const boundary = diagnostic.name.match(/^(.+)_diag_(begin|end)$/)
  if (boundary) {
    if (boundary[2] === 'begin') category = boundary[1]
    excludedBoundaries++
    continue
  }
  const { severity, table: _table, ...entry } = diagnostic
  const level = levels[severity]
  if (!category || !level || !entry.message) throw new Error(`Invalid SDK diagnostic: ${diagnostic.name}.`)
  diagnostics.push({ ...entry, category, level })
}
if (new Set(diagnostics.map((diagnostic): number => diagnostic.code)).size !== diagnostics.length) {
  throw new Error('The extracted SDK diagnostic codes are not unique.')
}
for (const [code, name] of [
  [731, 'sema_mismatched_types'],
  [776, 'sema_cannot_assign_to_immutable'],
] as const) {
  if (!diagnostics.some((diagnostic): boolean => diagnostic.code === code && diagnostic.name === name)) {
    throw new Error(`The extracted code for ${name} differs from SDK 1.2.1 integration results.`)
  }
}
const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(fs.readFileSync(libraryPath)).buffer)), (byte): string => byte.toString(16).padStart(2, '0')).join('')
const snapshot = {
  sdkVersion: version,
  target,
  source: {
    library,
    sha256,
    originalEntries: rawDiagnostics.filter((diagnostic): boolean => diagnostic.table === 'original').length,
    refactoredEntries: rawDiagnostics.filter((diagnostic): boolean => diagnostic.table === 'refactored').length,
    refactoredOffset: rawDiagnostics.find((diagnostic): boolean => diagnostic.table === 'original' && diagnostic.name === 'sema_diag_end')!.code,
    excludedBoundaries,
  },
  diagnostics,
}
const outputDirectory = Utils.resolvePath(directory, '../docs/data')
fs.mkdirSync(outputDirectory.fsPath, { recursive: true })
fs.writeFileSync(Utils.resolvePath(outputDirectory, `diagnostics-${version}.json`).fsPath, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`Extracted ${diagnostics.length} diagnostics from Cangjie SDK ${version} (${target}).`)
