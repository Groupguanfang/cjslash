import type { FloatingVueConfig } from '@shikijs/vitepress-twoslash/client'
import type { App } from 'vue'
import client from '@shikijs/vitepress-twoslash/client'

/**
 * Vue plugin shape installed by the shared FloatingVue client.
 *
 * ---
 *
 * 共用 FloatingVue 客户端安装的 Vue 插件形状。
 */
interface CjslashFloatingVuePlugin {
  install(app: App, options?: FloatingVueConfig): void
}

const CjslashFloatingVue: CjslashFloatingVuePlugin = (client as unknown as { default?: CjslashFloatingVuePlugin }).default ?? client

export default CjslashFloatingVue
export type { FloatingVueConfig }
