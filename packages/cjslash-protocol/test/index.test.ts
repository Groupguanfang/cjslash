import type { CjslashGenericFunction, CjslashResult, NodeError, TwoslashGenericResult } from '../src/index'
import * as upstream from 'twoslash-protocol'
import * as protocol from '../src/index'

describe('upstream protocol compatibility', () => {
  it.each([
    'createPositionConverter',
    'isInRange',
    'isInRanges',
    'mergeRanges',
    'removeCodeRanges',
    'resolveNodePositions',
    'splitLines',
  ] as const)('re-exports the original %s function', (name) => {
    expect(protocol[name]).toBe(upstream[name])
  })

  it('extends the upstream result without narrowing diagnostic codes', () => {
    expectTypeOf<CjslashResult>().toExtend<TwoslashGenericResult>()
    expectTypeOf<NodeError>().toEqualTypeOf<upstream.NodeError>()
    expectTypeOf<CjslashResult['extension']>().toEqualTypeOf<'cj'>()
    expectTypeOf<ReturnType<CjslashGenericFunction>>().toEqualTypeOf<Promise<TwoslashGenericResult>>()
    expectTypeOf<protocol.CjslashDiagnosticCode>().toEqualTypeOf<string | number>()
  })
})
