import type { ParserPreset, UserConfig } from '@commitlint/types'
import createPreset from 'conventional-changelog-conventionalcommits'

const typePrompt = {
  build: { emoji: '🛠️ ' },
  chore: { emoji: '♻️ ' },
  ci: { emoji: '⚙️ ' },
  docs: { emoji: '📚 ' },
  feat: { emoji: '✨ ' },
  fix: { emoji: '🐛 ' },
  perf: { emoji: '🚀 ' },
  refactor: { emoji: '🔨 ' },
  revert: { emoji: '🗑️ ' },
  style: { emoji: '💄 ' },
  test: { emoji: '🚨 ' },
} as const

/**
 * Create the Conventional Commits parser from the emojis used by Commitizen.
 *
 * ---
 *
 * 根据 Commitizen 使用的表情符号创建 Conventional Commits 解析器。
 */
async function createEmojiParser(): Promise<ParserPreset> {
  const emojiRegexPart = Object.values(typePrompt)
    .map((value: { emoji: string }): string => value.emoji.trim())
    .join('|')

  const parserOpts = {
    breakingHeaderPattern: new RegExp(`^(?:${emojiRegexPart})\\s+(\\w*)(?:\\((.*)\\))?!:\\s+(.*)$`),
    headerPattern: new RegExp(`^(?:${emojiRegexPart})\\s+(\\w*)(?:\\((.*)\\))?!?:\\s+(.*)$`),
  }

  return Object.assign({}, await createPreset(), {
    conventionalChangelog: { parserOpts },
    parserOpts,
    recommendedBumpOpts: { parserOpts },
  })
}

export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: await createEmojiParser(),
  prompt: {
    questions: {
      type: {
        enum: typePrompt,
        emojiInHeader: true,
      },
    },
  },
  rules: {
    'subject-case': [0],
  },
} satisfies UserConfig
