import type { LanguageRegistration } from 'shiki'
import cangjieGrammar from '../../../externals/vscode-cangjie/syntaxes/Cangjie.tmLanguage.json' with { type: 'json' }

/**
 * Official Cangjie TextMate grammar registered for Shiki with `cj` and `Cangjie` aliases.
 *
 * ---
 *
 * 注册到 Shiki 的官方仓颉 TextMate 语法，提供 `cj` 和 `Cangjie` 别名。
 */
export const cangjieLanguage: LanguageRegistration = {
  ...cangjieGrammar,
  name: 'cangjie',
  aliases: ['cj', 'Cangjie'],
}
