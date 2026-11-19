// @ts-check
import naily from 'naily-eslint-config'

export default naily({
  type: 'lib',
  ignores: [
    '**/*.config.ts',
    'docs/.vitepress/config.ts',
  ],
}).append({
  files: ['docs/.vitepress/**/*.ts'],
  languageOptions: {
    parserOptions: {
      project: true,
      projectService: false,
    },
  },
})
