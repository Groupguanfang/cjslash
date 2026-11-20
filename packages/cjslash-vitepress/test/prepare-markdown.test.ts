import type { Cjslash } from '@cjslash/core'
import { transformerCjslash } from '../src/index'
import { createResult } from './helpers'

const query = 'let answer = 42\n//  ^?\nmain() { println(answer) }'

describe('markdown fence preparation', () => {
  it('uses VitePress language normalization, aliases, and trailing whitespace rules', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockImplementation(async code => createResult(code))
    const transformer = transformerCjslash({ cjslasher })
    await transformer.prepareMarkdown([
      '~~~CJ cjslash {1}',
      'let first = 1',
      '~~~',
      '',
      '```Cangjie cjslash',
      'let second = 2',
      '```',
      '',
      '```cj cjslash',
      `${query}   `,
      '```',
    ].join('\r\n'))
    expect(cjslasher).toHaveBeenNthCalledWith(1, 'let first = 1', 'cj', {})
    expect(cjslasher).toHaveBeenNthCalledWith(2, 'let second = 2', 'cj', {})
    expect(cjslasher).toHaveBeenNthCalledWith(3, query, 'cj', {})
    expect(cjslasher).toHaveBeenCalledTimes(3)
  })

  it('ignores ordinary, disabled, unlabeled, and repeated fences', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult('let answer = 42'))
    const transformer = transformerCjslash({ cjslasher })
    await transformer.prepareMarkdown([
      '```',
      'let unlabeled = 0',
      '```',
      '',
      '```cj',
      'let ordinary = 1',
      '```',
      '',
      '```cj nocjslash',
      'let disabled = 2',
      '```',
      '',
      '```ts cjslash',
      'let typed = 3',
      '```',
      '',
      '```cj cjslash',
      'let repeated = 4',
      '```',
      '',
      '```custom cjslash',
      'let repeated = 4',
      '```',
    ].join('\n'))
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith('let repeated = 4', 'cj', {})
  })

  it.each([
    [false, undefined, '', true],
    [false, undefined, 'no-cjslash', false],
    [true, undefined, 'cjslash', true],
    [/example/, undefined, 'example', true],
    [/example/, undefined, 'cjslash', false],
    [
      false,
      [/skip/],
      'skip',
      false,
    ],
  ])('supports trigger %s and metadata %j', async (explicitTrigger, disableTriggers, attrs, expected) => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockResolvedValue(createResult('let answer = 42'))
    const transformer = transformerCjslash({ cjslasher, explicitTrigger, disableTriggers })
    await transformer.prepareMarkdown(`\`\`\`cj ${attrs}\nlet answer = 42\n\`\`\``)
    expect(cjslasher).toHaveBeenCalledTimes(expected ? 1 : 0)
  })

  it('prepares every fence when a custom filter needs Shiki context', async () => {
    const cjslasher = vi.fn<Cjslash['analyze']>().mockImplementation(async code => createResult(code))
    const filter = vi.fn((): boolean => false)
    const transformer = transformerCjslash({ cjslasher, filter })
    await transformer.prepareMarkdown('```ts custom\nlet typed = 1\n```')
    expect(cjslasher).toHaveBeenCalledExactlyOnceWith('let typed = 1', 'cj', {})
    expect(filter).not.toHaveBeenCalled()
  })

  it('shares in-flight work and retains failures for upstream error recovery', async () => {
    const failure = new Error('Analysis failed')
    const cjslasher = vi.fn<Cjslash['analyze']>().mockRejectedValue(failure)
    const transformer = transformerCjslash({ cjslasher })
    await expect(transformer.prepareMarkdown('```cj cjslash\nlet answer = 42\n```')).resolves.toBeUndefined()
    await expect(transformer.prepareMarkdown('```cj cjslash\nlet answer = 42\n```')).resolves.toBeUndefined()
    expect(cjslasher).toHaveBeenCalledTimes(2)
  })
})
