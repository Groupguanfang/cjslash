<script setup lang="ts">
import snapshot from '../data/diagnostics-1.2.1.json'

/**
 * A diagnostic entry inferred from the versioned SDK snapshot.
 *
 * ---
 *
 * 从带版本的 SDK 快照推导出的诊断条目。
 */
type Diagnostic = (typeof snapshot.diagnostics)[number]

/**
 * Localized labels for diagnostic search, filters, table columns, and hints.
 *
 * ---
 *
 * 诊断搜索、筛选器、表格列与提示信息的本地化标签。
 */
interface DiagnosticLabels {
  search: string
  placeholder: string
  category: string
  allCategories: string
  level: string
  allLevels: string
  reset: string
  count: string
  caption: string
  code: string
  name: string
  message: string
  mainHint: string
  otherHints: string
  empty: string
  levels: Record<string, string>
  categories: Record<string, string>
}

const translations: Record<string, DiagnosticLabels> = {
  zh: {
    search: '搜索诊断',
    placeholder: '输入编号、名称或消息，例如 776、immutable',
    category: '分类',
    allCategories: '全部分类',
    level: '级别',
    allLevels: '全部级别',
    reset: '重置',
    count: '显示 {matched} / {total} 条诊断',
    caption: '仓颉 SDK 1.2.1 诊断码表',
    code: '编号',
    name: '诊断名称',
    message: '消息与提示模板',
    mainHint: '主提示',
    otherHints: '附加提示',
    empty: '没有匹配的诊断，请调整搜索词或筛选条件。',
    levels: {
      error: '错误',
      warning: '警告',
      note: '说明',
      hint: '提示',
    },
    categories: {
      chir: 'CHIR 与编译期求值',
      macro_expand: '宏展开',
      sema: '语义分析',
      conditional_compilation: '条件编译',
      driver: '编译驱动',
      frontend: '编译前端',
      incremental_compilation: '增量编译',
      lex: '词法分析',
      module: '模块',
      import_package: '包导入',
      parse: '语法分析',
      parse_query: '语法查询',
    },
  },
  en: {
    search: 'Search diagnostics',
    placeholder: 'Code, name, or message, e.g. 776, immutable',
    category: 'Category',
    allCategories: 'All categories',
    level: 'Level',
    allLevels: 'All levels',
    reset: 'Reset',
    count: 'Showing {matched} / {total} diagnostics',
    caption: 'Cangjie SDK 1.2.1 diagnostic codes',
    code: 'Code',
    name: 'Diagnostic name',
    message: 'Message and hint templates',
    mainHint: 'Primary hint',
    otherHints: 'Additional hints',
    empty: 'No matching diagnostics. Adjust the search or filters.',
    levels: {
      error: 'Error',
      warning: 'Warning',
      note: 'Note',
      hint: 'Hint',
    },
    categories: {
      chir: 'CHIR and compile-time evaluation',
      macro_expand: 'Macro expansion',
      sema: 'Semantic analysis',
      conditional_compilation: 'Conditional compilation',
      driver: 'Compiler driver',
      frontend: 'Compiler frontend',
      incremental_compilation: 'Incremental compilation',
      lex: 'Lexing',
      module: 'Modules',
      import_package: 'Package imports',
      parse: 'Parsing',
      parse_query: 'Parser queries',
    },
  },
}

const { lang } = useData()
const id = useId()
const search = ref('')
const category = ref('')
const level = ref('')
const categories = [
  ...new Set(snapshot.diagnostics.map((diagnostic: Diagnostic): string => diagnostic.category)),
]
const levels = [
  ...new Set(snapshot.diagnostics.map((diagnostic: Diagnostic): string => diagnostic.level)),
]

/**
 * Select table labels using the current documentation language.
 *
 * ---
 *
 * 根据当前文档语言选择表格标签。
 */
const labels = computed((): DiagnosticLabels => translations[lang.value.startsWith('zh')
  ? 'zh'
  : 'en'])

/**
 * Match every search term against the code, name, message, and hint templates.
 *
 * ---
 *
 * 在编号、名称、消息与提示模板中匹配所有搜索词。
 */
const diagnostics = computed((): Diagnostic[] => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return snapshot.diagnostics.filter((diagnostic: Diagnostic): boolean => {
    if (category.value && diagnostic.category !== category.value) return false
    if (level.value && diagnostic.level !== level.value) return false
    const text = [
      diagnostic.code,
      diagnostic.name,
      diagnostic.message,
      diagnostic.mainHint,
      ...diagnostic.otherHints,
    ].join(' ').toLowerCase()
    return terms.every((term: string): boolean => text.includes(term))
  })
})

/**
 * Announce the number of matching and available diagnostics.
 *
 * ---
 *
 * 显示并播报匹配的诊断数量和诊断总数。
 */
const summary = computed((): string => labels.value.count.replace('{matched}', String(diagnostics.value.length)).replace('{total}', String(snapshot.diagnostics.length)))

/**
 * Restore the complete diagnostic table.
 *
 * ---
 *
 * 恢复完整诊断表。
 */
function resetFilters(): void {
  search.value = ''
  category.value = ''
  level.value = ''
}
</script>

<template>
  <div class="cjslash-diagnostics">
    <div class="diagnostic-filters">
      <label class="diagnostic-search" :for="`${id}-search`">
        <span>{{ labels.search }}</span>
        <input :id="`${id}-search`" v-model="search" type="search" :placeholder="labels.placeholder">
      </label>
      <label :for="`${id}-category`">
        <span>{{ labels.category }}</span>
        <select :id="`${id}-category`" v-model="category" :aria-label="labels.category">
          <option value="">{{ labels.allCategories }}</option>
          <option v-for="name in categories" :key="name" :value="name">{{ labels.categories[name] }}</option>
        </select>
      </label>
      <label :for="`${id}-level`">
        <span>{{ labels.level }}</span>
        <select :id="`${id}-level`" v-model="level" :aria-label="labels.level">
          <option value="">{{ labels.allLevels }}</option>
          <option v-for="name in levels" :key="name" :value="name">{{ labels.levels[name] }}</option>
        </select>
      </label>
      <button type="button" :disabled="!search && !category && !level" @click="resetFilters">
        {{ labels.reset }}
      </button>
    </div>
    <p class="diagnostic-summary" role="status">
      {{ summary }}
    </p>
    <div class="diagnostic-table" role="region" :aria-label="labels.caption" tabindex="0">
      <table>
        <caption>{{ labels.caption }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ labels.code }}</th>
            <th scope="col">{{ labels.name }}</th>
            <th scope="col">{{ labels.level }}</th>
            <th scope="col">{{ labels.message }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="diagnostic in diagnostics" :key="diagnostic.code">
            <td><code>{{ diagnostic.code }}</code></td>
            <td class="diagnostic-name">
              <code>{{ diagnostic.name }}</code>
              <span class="diagnostic-category">{{ labels.categories[diagnostic.category] }}</span>
            </td>
            <td><span class="diagnostic-level" :data-level="diagnostic.level">{{ labels.levels[diagnostic.level] }}</span></td>
            <td class="diagnostic-message">
              <code>{{ diagnostic.message }}</code>
              <p v-if="diagnostic.mainHint" class="diagnostic-hints">
                <strong>{{ labels.mainHint }}:</strong> <code>{{ diagnostic.mainHint }}</code>
              </p>
              <div v-if="diagnostic.otherHints.length" class="diagnostic-hints">
                <strong>{{ labels.otherHints }}:</strong>
                <ul>
                  <li v-for="(hint, index) in diagnostic.otherHints" :key="index"><code>{{ hint }}</code></li>
                </ul>
              </div>
            </td>
          </tr>
          <tr v-if="!diagnostics.length">
            <td colspan="4">{{ labels.empty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.diagnostic-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-top: 24px;
}

.diagnostic-filters label {
  display: flex;
  flex: 1 1 140px;
  flex-direction: column;
  gap: 6px;
  font-size: 0.875rem;
}

.diagnostic-filters .diagnostic-search {
  flex: 2 1 280px;
}

.diagnostic-filters input,
.diagnostic-filters select,
.diagnostic-filters button {
  min-width: 0;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}

.diagnostic-filters select {
  padding-right: 28px;
  appearance: auto;
}

.diagnostic-filters :is(input, select, button):focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.diagnostic-filters button {
  cursor: pointer;
}

.diagnostic-filters button:disabled {
  cursor: default;
  opacity: 0.5;
}

.diagnostic-summary {
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}

.diagnostic-table {
  max-width: 100%;
  overflow-x: auto;
}

.diagnostic-table table {
  display: table;
  width: max-content;
  min-width: 100%;
  margin-top: 0;
}

.diagnostic-table caption {
  padding-bottom: 12px;
  color: var(--vp-c-text-2);
  text-align: left;
  font-size: 0.875rem;
}

.diagnostic-table :is(th, td) {
  vertical-align: top;
  white-space: nowrap;
}

.diagnostic-category {
  display: block;
  margin-top: 6px;
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
}

.diagnostic-table code {
  white-space: pre;
  overflow-wrap: normal;
  word-break: normal;
}

.diagnostic-table .diagnostic-hints {
  margin: 10px 0 0;
  font-size: 0.8125rem;
}

.diagnostic-hints ul {
  margin: 4px 0 0;
  padding-left: 16px;
}

.diagnostic-level[data-level="error"] {
  color: var(--vp-c-danger-1);
}

.diagnostic-level[data-level="warning"] {
  color: var(--vp-c-warning-1);
}

.diagnostic-level[data-level="note"] {
  color: var(--vp-c-brand-1);
}
</style>
