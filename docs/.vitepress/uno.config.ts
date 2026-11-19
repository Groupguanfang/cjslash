import { defineConfig, presetAttributify, presetIcons, presetWind3, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [presetWind3(), presetAttributify(), presetIcons()],
  transformers: [transformerDirectives()],
  blocklist: [
    'container',
  ],
  theme: {
    colors: {
      primary: 'var(--vp-c-brand-1)',
      secondary: 'var(--cj-c-secondary-1)',
      paper: 'var(--cj-c-paper-wash)',
      main: 'var(--vp-c-text-1)',
      muted: 'var(--vp-c-text-2)',
    },
    fontFamily: {
      display: '\'Cjslash Display\', var(--vp-font-family-base), sans-serif',
      base: 'var(--vp-font-family-base)',
    },
    breakpoints: {
      desktop: '60rem',
    },
  },
  variants: [
    (matcher) => {
      if (!matcher.startsWith('vp:'))
        return matcher
      return {
        matcher: matcher.slice(3),
        selector: selector => `.vp-doc ${selector}`,
      }
    },
    (matcher) => {
      if (!matcher.startsWith('en:'))
        return matcher
      return {
        matcher: matcher.slice(3),
        selector: selector => `${selector}:is(html[lang='en'] *)`,
      }
    },
  ],
  shortcuts: {
    'font-heading': 'font-display [font-synthesis:none]',
  },
})
