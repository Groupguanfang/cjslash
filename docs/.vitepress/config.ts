import type { MarkdownRenderer } from 'vitepress'
import { vitePluginCjslash } from '@cjslash/vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import ts from 'typescript'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vitepress'
import { URI, Utils } from 'vscode-uri'

const directory = Utils.dirname(URI.parse(import.meta.url))

export default defineConfig({
  title: 'Cjslash',
  description: '为仓颉文档带来类型感知的代码示例。',

  head: [
    [
      'link',
      { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '未找到相关结果：',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '上方向键',
                  navigateDownKeyAriaLabel: '下方向键',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc 键',
                },
              },
            },
          },
          en: {
            translations: {
              button: {
                buttonText: 'Search docs',
                buttonAriaLabel: 'Search docs',
              },
            },
          },
        },
      },
    },
  },

  vite: {
    plugins: [
      AutoImport({
        include: [/\.[cm]?[jt]sx?$/, /\.vue($|\?)/, /\.md($|\?)/],
        imports: ['vue', 'vitepress', '@vueuse/core'],
        dts: Utils.resolvePath(directory, '../auto-imports.d.ts').fsPath,
        vueTemplate: true,
      }),
      Components({
        dirs: [
          Utils.resolvePath(directory, '../components').fsPath,
        ],
        include: [/\.vue($|\?)/, /\.md($|\?)/],
        dts: Utils.resolvePath(directory, '../components.d.ts').fsPath,
      }),
      UnoCSS(Utils.resolvePath(directory, './uno.config.ts').fsPath),
      vitePluginCjslash({
        cjslashOptions: {
          customTags: ['warn', 'error', 'log', 'annotate'],
        },
      }),
    ],
  },

  markdown: {
    languages: ['js', 'jsx', 'ts', 'tsx'],
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          vfsRoot: Utils.resolvePath(directory, '../..').fsPath,
          compilerOptions: {
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            types: ['node'],
            skipLibCheck: true,
            noUncheckedSideEffectImports: false,
          },
        },
      }),
    ],
    /**
     * Display annotated examples beside their original input using the existing fence renderer.
     *
     * ---
     *
     * 复用现有围栏渲染器，通过标签页展示带标记的示例及其原始输入。
     */
    config(markdown: MarkdownRenderer): void {
      const fence = markdown.renderer.rules.fence
      if (!fence) return

      /**
       * Render both views of an annotated Cangjie fence without analyzing its input view.
       *
       * ---
       *
       * 渲染仓颉标记围栏的两种视图，输入视图仅做静态高亮。
       */
      markdown.renderer.rules.fence = (tokens, index, options, env, renderer): string => {
        const token = tokens[index]
        if (!/^(?:cj|cangjie)(?=$|[\s{:])/i.test(token.info)
          || !/(?:^|\s)cjslash(?=\s|$)/.test(token.info)
          || /(?:^|\s)(?:nocjslash|no-cjslash)(?=\s|$)/.test(token.info)
          || !/\/\/\s*@|\^[?^|]|---cut/.test(token.content)) {
          return fence(tokens, index, options, env, renderer)
        }

        const preferInput = /(?:^|\s)input(?=\s|$)/.test(token.info)
        const info = token.info
        const rendered = fence(tokens, index, options, env, renderer)
        token.info = info.replace(/(^|\s)(?:cjslash|input)(?=\s|$)/g, '$1').trim()
        try {
          return [
            `<CjslashRenderTabs${preferInput ? ' :prefer-input="true"' : ''}>`,
            '<template #rendered>',
            rendered,
            '</template>',
            '<template #source>',
            fence(tokens, index, options, env, renderer),
            '</template>',
            '</CjslashRenderTabs>',
          ].join('\n')
        }
        finally {
          token.info = info
        }
      }
    },
    theme: {
      light: 'monokai',
      dark: 'monokai',
    },
  },

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Cjslash',
      description: '为仓颉文档带来类型感知的代码示例。',
      markdown: {
        container: {
          infoLabel: '信息',
          noteLabel: '注意',
          tipLabel: '提示',
          warningLabel: '警告',
          dangerLabel: '危险',
          detailsLabel: '详细信息',
          importantLabel: '重要',
          cautionLabel: '当心',
        },
        codeCopyButton: {
          tooltipText: '复制代码',
          copiedText: '已复制',
        },
      },
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '指南', link: '/guide/' },
          {
            text: '集成',
            items: [
              { text: 'VitePress', link: '/guide/vitepress' },
              { text: 'Shiki', link: '/guide/highlight' },
            ],
          },
          { text: '参考', link: '/refs/notations' },
        ],
        sidebar: [
          {
            text: '指南',
            items: [
              { text: '认识 Cjslash', link: '/guide/' },
              { text: '安装与使用', link: '/guide/install' },
              { text: '与 Twoslash 的关系', link: '/guide/compatibility' },
              { text: '常见问题', link: '/guide/troubleshooting' },
            ],
          },
          {
            text: '集成',
            items: [
              { text: 'VitePress', link: '/guide/vitepress' },
              { text: 'Shiki 语法高亮', link: '/guide/highlight' },
            ],
          },
          {
            text: '参考',
            items: [
              { text: '注释标记', link: '/refs/notations' },
              { text: 'API', link: '/refs/api' },
              { text: '配置选项', link: '/refs/options' },
              { text: '分析结果', link: '/refs/result' },
            ],
          },
        ],
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '回到顶部',
        langMenuLabel: '切换语言',
        navMenuLabel: '主导航',
        mobileMenuLabel: '菜单',
        extraMenuLabel: '更多选项',
        skipToContentLabel: '跳到正文',
        notFound: {
          title: '页面未找到',
          quote: '你访问的页面不存在，或者已经被移动。',
          link: '/',
          linkLabel: '返回首页',
          linkText: '回到首页',
        },
      },
    },

    en: {
      label: 'English',
      lang: 'en',
      title: 'Cjslash',
      description: 'Type-aware code examples for Cangjie documentation.',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guide', link: '/en/guide/' },
          {
            text: 'Integrations',
            items: [
              { text: 'VitePress', link: '/en/guide/vitepress' },
              { text: 'Shiki', link: '/en/guide/highlight' },
            ],
          },
          { text: 'Reference', link: '/en/refs/notations' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Introduction', link: '/en/guide/' },
              { text: 'Installation & usage', link: '/en/guide/install' },
              { text: 'Twoslash compatibility', link: '/en/guide/compatibility' },
              { text: 'Troubleshooting', link: '/en/guide/troubleshooting' },
            ],
          },
          {
            text: 'Integrations',
            items: [
              { text: 'VitePress', link: '/en/guide/vitepress' },
              { text: 'Shiki highlighting', link: '/en/guide/highlight' },
            ],
          },
          {
            text: 'Reference',
            items: [
              { text: 'Notations', link: '/en/refs/notations' },
              { text: 'API', link: '/en/refs/api' },
              { text: 'Options', link: '/en/refs/options' },
              { text: 'Results', link: '/en/refs/result' },
            ],
          },
        ],
        outline: { label: 'On this page' },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
        langMenuLabel: 'Change language',
        navMenuLabel: 'Main navigation',
        mobileMenuLabel: 'Menu',
        extraMenuLabel: 'More options',
        skipToContentLabel: 'Skip to content',
        notFound: {
          title: 'PAGE NOT FOUND',
          quote: 'The page you are looking for does not exist or has been moved.',
          link: '/en/',
          linkLabel: 'Go to home',
          linkText: 'Take me home',
        },
      },
    },
  },
})
