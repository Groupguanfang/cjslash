import type { CjslashResult, NodeWithoutPosition } from '@cjslash/protocol'
import { resolveNodePositions } from '@cjslash/protocol'

/**
 * Create an analysis fixture using upstream node positioning.
 *
 * ---
 *
 * 使用上游节点定位工具创建分析结果夹具。
 */
export function createResult(code: string, inputNodes: NodeWithoutPosition[] = []): CjslashResult {
  const nodes = resolveNodePositions(inputNodes, code)
  return {
    code,
    extension: 'cj',
    nodes,
    meta: {
      extension: 'cj',
      handbookOptions: {
        errors: [],
        noErrors: false,
        noErrorValidation: false,
        noStaticSemanticInfo: false,
        keepNotations: false,
        noErrorsCutted: false,
      },
      removals: [],
      positionQueries: [],
      positionCompletions: [],
      positionHighlights: [],
    },
    hovers: nodes.filter(node => node.type === 'hover'),
    queries: nodes.filter(node => node.type === 'query'),
    errors: nodes.filter(node => node.type === 'error'),
    highlights: nodes.filter(node => node.type === 'highlight'),
    tags: nodes.filter(node => node.type === 'tag'),
    completions: nodes.filter(node => node.type === 'completion'),
  }
}
