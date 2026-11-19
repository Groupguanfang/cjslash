<script setup lang="ts">
/**
 * Configure the initially selected view of a documentation example.
 *
 * ---
 *
 * 配置文档示例默认选中的视图。
 */
interface CjslashRenderTabsProps {
  /**
   * Place the original input first and select it initially.
   *
   * ---
   *
   * 将原始输入放在首位并默认选中。
   */
  preferInput?: boolean
}

const props = defineProps<CjslashRenderTabsProps>()
const { lang } = useData()
const id = useId()
const tabs = props.preferInput
  ? ['source', 'rendered'] as const
  : ['rendered', 'source'] as const
const tab = ref<(typeof tabs)[number]>(tabs[0])
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

/**
 * Translate the example tabs using the current documentation language.
 *
 * ---
 *
 * 根据当前文档语言翻译示例标签。
 */
const labels = computed((): Record<(typeof tabs)[number], string> => lang.value.startsWith('zh')
  ? { rendered: '渲染结果', source: '输入代码' }
  : { rendered: 'Rendered', source: 'Input Code' })

/**
 * Select and focus a tab, wrapping arrow-key navigation at either end.
 *
 * ---
 *
 * 选中并聚焦标签，方向键导航在两端循环。
 */
function selectTab(index: number): void {
  const position = (index + tabs.length) % tabs.length
  tab.value = tabs[position]
  buttons.value?.[position]?.focus()
}
</script>

<template>
  <div class="cjslash-render-tabs">
    <div class="cjslash-render-tabs-list" role="tablist" :aria-label="lang.startsWith('zh') ? '代码示例' : 'Code example'">
      <button
        v-for="(name, index) in tabs"
        :id="`${id}-${name}-tab`"
        :key="name"
        ref="buttons"
        class="cjslash-render-tabs-tab"
        type="button"
        role="tab"
        :aria-controls="`${id}-${name}-panel`"
        :aria-selected="tab === name"
        :tabindex="tab === name ? 0 : -1"
        @click="tab = name"
        @keydown.right.prevent="selectTab(index + 1)"
        @keydown.left.prevent="selectTab(index - 1)"
        @keydown.home.prevent="selectTab(0)"
        @keydown.end.prevent="selectTab(tabs.length - 1)"
      >
        {{ labels[name] }}
      </button>
    </div>
    <div
      v-for="name in tabs"
      v-show="tab === name"
      :id="`${id}-${name}-panel`"
      :key="name"
      class="cjslash-render-tabs-panel"
      role="tabpanel"
      :aria-labelledby="`${id}-${name}-tab`"
      tabindex="0"
    >
      <slot v-if="tab === name" :name="name" />
    </div>
  </div>
</template>
