<script setup lang="ts">
const { lang } = useData()

const messages = {
  zh: {
    eyebrow: '仓颉文档 · 类型感知',
    tagline: '让仓颉文档中的代码拥有类型',
    description: '把推断类型、函数签名和编译诊断带进每一个代码示例。',
    actionText: '开始使用',
    actionLink: '/guide/',
    manifesto: [
      'Cjslash 把仓颉编译器已经掌握的信息带进文档阅读体验',
      '让代码块里的每个符号都能解释自己',
      '让每个示例都能被验证',
    ],
    featuresLabel: '核心能力',
    features: [
      {
        title: '类型悬浮',
        description: '在代码块中悬停符号，查看推断类型、函数签名与文档注释。',
      },
      {
        title: '类型查询',
        description: '用 // ^? 指向表达式，直接呈现仓颉编译器推断出的类型。',
      },
      {
        title: '真实诊断',
        description: '展示编译错误，并支持为教学示例声明预期诊断，让反例也能被验证。',
      },
    ],
  },
  en: {
    eyebrow: 'Cangjie documentation · type-aware',
    tagline: 'Bring type awareness to Cangjie docs',
    description: 'Inferred types, function signatures, and compiler diagnostics in every code example.',
    actionText: 'Get started',
    actionLink: '/en/guide/',
    manifesto: [
      'Cjslash brings what the Cangjie compiler already knows into the reading experience',
      'Every symbol can explain itself',
      'and every example can be verified',
    ],
    featuresLabel: 'Core capabilities',
    features: [
      {
        title: 'Hover insights',
        description: 'Hover over symbols in a code block to see inferred types, signatures, and documentation.',
      },
      {
        title: 'Type queries',
        description: 'Point // ^? at an expression to render the type inferred by the Cangjie compiler.',
      },
      {
        title: 'Real diagnostics',
        description: 'Show compiler errors and declare expected diagnostics for teaching examples.',
      },
    ],
  },
}

const content = computed(() =>
  messages[lang.value.startsWith('en')
    ? 'en'
    : 'zh'],
)
</script>

<template>
  <div
    class="cj-home"
    m="x-auto y-0"
    w="full"
    max-w="[62.5rem]"
    p="x-0 y-20 [@media(max-width:800px)]:y-0"
  >
    <section
      flex="~ col"
      items="center"
      p="x-0 y-24 [@media(max-width:800px)]:y-12"
      text="center"
      bg="paper"
      border="l-8 l-solid l-[rgba(45,119,238,0.62)] dark:l-[rgba(45,119,238,0.9)]"
    >
      <div w="full" max-w="[40rem]">
        <p
          vp:m="y-4 x-0"
          vp:text="muted [0.8rem]"
          vp:font="bold"
          vp:tracking="[0.2em]"
          vp:leading="8"
          vp:uppercase
        >
          {{ content.eyebrow }}
        </p>
        <h1
          vp:m="x-0 t-16 b-8"
          vp:text="main [3.8rem] [@media(max-width:800px)]:[2rem]"
          vp:font="semibold"
          vp:tracking="[-0.03em] en:[-0.02em]"
          vp:leading="[1.4285714] min-[48rem]:[1.25]"
        >
          Cjslash
        </h1>
        <p
          vp:m="y-4 x-0"
          vp:text="[1.35rem]"
          vp:font="bold en:semibold"
          vp:leading="8"
          vp:whitespace="desktop:nowrap"
        >
          {{ content.tagline }}
        </p>
        <p
          vp:m="y-4 x-0"
          vp:text="muted [1.05rem]"
          vp:leading="8"
          vp:whitespace="desktop:nowrap"
        >
          {{ content.description }}
        </p>
        <a
          class="vp:[transition-property:color,border-color,background-color]"
          :href="withBase(content.actionLink)"
          vp:flex="inline"
          vp:items="center"
          vp:justify="center"
          vp:m="y-10"
          vp:p="x-3 y-[7.5px]"
          vp:border="~ solid primary hover:primary"
          vp:shadow="[inset_3px_0_0_0_var(--vp-c-brand-1)]"
          vp:text="main [0.9rem] hover:white"
          vp:font="light"
          vp:leading="6"
          vp:no-underline
          vp:duration="200"
          vp:bg="hover:primary"
          vp:focus-visible:outline="2 solid secondary offset-3"
        >
          {{ content.actionText }}
        </a>
        <img
          class="vp:dark:invert"
          :src="withBase('/svgs/squiggle.svg')"
          alt=""
          aria-hidden="true"
          width="71"
          height="27"
          vp:m="x-auto b-12 t-4"
          vp:block
          vp:h="auto"
          vp:w="[71px]"
        >
        <p
          vp:m="x-auto y-4"
          vp:text="[1.1rem] center"
          vp:leading="8"
        >
          <span
            v-for="line in content.manifesto"
            :key="line"
            block
            whitespace="desktop:nowrap"
          >{{ line }}</span>
        </p>
        <img
          :src="withBase('/logo.svg')"
          alt="Cjslash"
          width="167"
          height="167"
          vp:m="x-auto b-0 t-12"
          vp:block
          vp:h="auto"
          vp:w="[167px]"
          vp:max-w="full"
        >
      </div>
    </section>

    <section
      :aria-label="content.featuresLabel"
      grid="~ cols-3 max-[59.99rem]:cols-1"
      gap="4"
      m="t-4"
    >
      <article
        v-for="feature in content.features"
        :key="feature.title"
        class="[&:nth-child(2)]:before:bg-secondary"
        relative
        p="l-7 r-6 y-7"
        border="t t-solid t-$vp-c-divider"
        bg="paper"
        un-before="absolute -top-px bottom-0 left-0 w-1 bg-primary content-empty pointer-events-none"
      >
        <h2
          vp:m="0"
          vp:border="0"
          vp:p="0"
          vp:text="[1.05rem]"
          vp:tracking="normal"
          vp:leading="[1.4]"
        >
          {{ feature.title }}
        </h2>
        <p
          vp:m="x-0 b-0 t-[0.55rem]"
          vp:text="muted [0.95rem]"
          vp:leading="[1.75]"
        >
          {{ feature.description }}
        </p>
      </article>
    </section>
  </div>
</template>
