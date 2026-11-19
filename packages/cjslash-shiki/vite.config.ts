import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    copy: [
      '../../LICENSE',
      { from: '../../externals/vscode-cangjie/LICENSE', rename: 'LICENSE.cangjie' },
    ],
  },
})
