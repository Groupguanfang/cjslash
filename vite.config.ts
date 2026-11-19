import { defineConfig } from 'vite-plus'
import { URI, Utils } from 'vscode-uri'

const directory = Utils.dirname(URI.parse(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@cjslash/protocol': Utils.resolvePath(directory, './packages/cjslash-protocol/src/index.ts').fsPath,
      '@cjslash/shiki': Utils.resolvePath(directory, './packages/cjslash-shiki/src/index.ts').fsPath,
      '@cjslash/vitepress/client': Utils.resolvePath(directory, './packages/cjslash-vitepress/src/client.ts').fsPath,
      '@cjslash/vitepress': Utils.resolvePath(directory, './packages/cjslash-vitepress/src/index.ts').fsPath,
      'cjslash': Utils.resolvePath(directory, './packages/cjslash/src/index.ts').fsPath,
    },
  },

  test: {
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'sdk',
          include: ['packages/*/test/**/*.integration.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/cjslash/src/**/*.ts', 'packages/cjslash-shiki/src/**/*.ts', 'packages/cjslash-vitepress/src/**/*.ts'],
      exclude: ['**/types.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },

  run: {
    cache: true,
    tasks: {
      'setup': {
        cache: false,
        command: 'vp hooks enable --hooks-dir hooks',
      },
      'lint': {
        cache: false,
        command: 'eslint . --no-warn-ignored',
      },
      'lint:fix': {
        cache: false,
        command: 'eslint . --fix --no-warn-ignored',
      },
      'typecheck': {
        cache: false,
        command: 'tsc --noEmit',
      },
      'typecheck:docs': {
        cache: false,
        command: 'tsc -p docs/tsconfig.json --noEmit',
      },
      'check': {
        cache: false,
        command: 'vp run typecheck:docs',
        dependsOn: ['lint', 'typecheck'],
      },
      'build:protocol': {
        command: 'vp pack',
        cwd: 'packages/cjslash-protocol',
      },
      'build:cjslash': {
        command: 'vp pack',
        cwd: 'packages/cjslash',
        dependsOn: ['build:protocol'],
      },
      'build:shiki': {
        command: 'vp pack',
        cwd: 'packages/cjslash-shiki',
        dependsOn: ['build:cjslash'],
      },
      'build:vitepress': {
        command: 'vp pack',
        cwd: 'packages/cjslash-vitepress',
        dependsOn: ['build:shiki'],
      },
      'docs:dev': {
        cache: false,
        command: 'vitepress dev docs',
        dependsOn: ['build:vitepress'],
      },
      'docs:build': {
        cache: { env: ['CJSLASH_SDK_PATH', 'CANGJIE_HOME'] },
        command: 'vitepress build docs',
        dependsOn: ['build:vitepress'],
      },
      'docs:preview': {
        cache: false,
        command: 'vitepress preview docs',
      },
      'test': {
        cache: false,
        command: 'vp test --project unit',
      },
      'test:watch': {
        cache: false,
        command: 'vp test watch --project unit',
      },
      'test:ui': {
        cache: false,
        command: 'vp test watch --project unit --ui --coverage',
      },
      'test:coverage': {
        cache: false,
        command: 'vp test --project unit --coverage',
      },
      'test:sdk': {
        cache: false,
        command: 'vp test --project sdk',
      },
    },
  },

  staged: {
    '*.{js,cjs,mjs,jsx,ts,tsx,mts,cts,vue,md,json,jsonc,yml,yaml,css}': 'eslint --fix --no-warn-ignored',
  },
})
