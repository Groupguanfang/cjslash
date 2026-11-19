import type { CjslashResult } from '@cjslash/protocol'
import type { TwoslashShikiReturn } from '@shikijs/twoslash/core'
import type { CjslashShikiTransformer, TransformerCjslashOptions } from './types'
import { createTransformerFactory, rendererRich, ShikiTwoslashError } from '@shikijs/twoslash/core'

/**
 * Create a Shiki transformer backed by asynchronously prepared Cangjie results.
 *
 * Call `await transformer.prepare(code)` before highlighting the same original code.
 * The supplied analyzer remains owned by its caller.
 *
 * ---
 *
 * 创建使用异步准备的仓颉分析结果的 Shiki transformer。
 *
 * 高亮前先对同一份原始源码调用 `await transformer.prepare(code)`。
 * 传入的分析器仍归调用方持有。
 */
export function transformerCjslash(options: TransformerCjslashOptions): CjslashShikiTransformer {
  const { cjslasher, cjslashOptions = {}, rendererRich: rendererOptions, ...transformerOptions } = options
  const { signal: _signal, filterNode: _filterNode, shouldGetHoverInfo: _shouldGetHoverInfo, ...cloneableOptions } = cjslashOptions
  const executeOptions = {
    ...cjslashOptions,
    ...structuredClone(cloneableOptions),
  }
  const preparedResults = new Map<string, CjslashResult>()
  const preparations = new Map<string, Promise<CjslashResult>>()

  /**
   * Read a prepared result synchronously for the upstream transformer.
   *
   * ---
   *
   * 为上游 transformer 同步读取已准备的分析结果。
   */
  function readPreparedResult(code: string): TwoslashShikiReturn {
    const result = preparedResults.get(code)
    if (!result) throw new ShikiTwoslashError('Cangjie source has not been prepared. Call await transformer.prepare(code) with the exact original source before highlighting.')
    return result
  }

  /**
   * Prepare one original source and share concurrent analysis work.
   *
   * ---
   *
   * 准备一份原始源码，并共享并发的分析任务。
   */
  function prepare(code: string): Promise<CjslashResult> {
    const result = preparedResults.get(code)
    if (result) return Promise.resolve(result)
    let pending = preparations.get(code)
    if (!pending) {
      pending = Promise.resolve()
        .then((): Promise<CjslashResult> => cjslasher(code, 'cj', executeOptions))
        .then((result): CjslashResult => {
          preparedResults.set(code, result)
          return result
        })
        .finally((): void => {
          preparations.delete(code)
        })
      preparations.set(code, pending)
    }
    return pending
  }

  const transformer = createTransformerFactory(
    readPreparedResult,
    rendererRich({
      ...rendererOptions,
      processHoverInfo: rendererOptions?.processHoverInfo ?? preserveHoverInfo,
    }),
  )({
    ...transformerOptions,
    langs: transformerOptions.langs ?? ['cj'],
    langAlias: { cangjie: 'cj', Cangjie: 'cj', ...transformerOptions.langAlias },
    explicitTrigger: transformerOptions.explicitTrigger === true
      ? /\bcjslash\b/
      : transformerOptions.explicitTrigger,
    disableTriggers: transformerOptions.disableTriggers ?? ['nocjslash', 'no-cjslash'],
    twoslashOptions: {},
  })

  return {
    ...transformer,
    name: '@cjslash/shiki',
    prepare,
  }
}

/**
 * Preserve Cangjie signatures without TypeScript-specific rewriting.
 *
 * ---
 *
 * 保留仓颉签名，不执行 TypeScript 特有的改写。
 */
function preserveHoverInfo(info: string): string {
  return info
}

export { cangjieLanguage } from './language'
export type { CjslashShikiTransformer, TransformerCjslashOptions } from './types'
export { rendererClassic, rendererRich, ShikiTwoslashError } from '@shikijs/twoslash/core'
export type { HastExtension, RendererRichOptions, TwoslashRenderer } from '@shikijs/twoslash/core'
