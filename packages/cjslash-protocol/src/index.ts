export type { CjslashDiagnosticCode, CjslashHandbookOptions } from './types/options'
export type { CjslashGenericFunction, CjslashResult, CjslashResultMeta } from './types/returns'
export type { CompletionEntry, ErrorLevel, NodeBase, NodeCompletion, NodeError, NodeErrorWithoutPosition, NodeHighlight, NodeHover, NodeQuery, NodeStartLength, NodeTag, NodeWithoutPosition, Position, Range, TwoslashGenericResult, TwoslashNode } from 'twoslash-protocol'
export { createPositionConverter, isInRange, isInRanges, mergeRanges, removeCodeRanges, resolveNodePositions, splitLines } from 'twoslash-protocol'
