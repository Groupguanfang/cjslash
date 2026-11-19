import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      client: 'src/client.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    copy: ['../../LICENSE'],
  },
})
