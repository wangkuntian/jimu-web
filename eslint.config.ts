import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    'src/shared/api/generated.ts',
    // 安装到仓库内的 agent skill 包与其 SDD 工作区：第三方内容，不参与本项目门禁。
    // .gitignore 只影响 git 跟踪，ESLint 需要在这里单独排除。
    '.agents/**',
    '.superpowers/**',
  ]),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  skipFormatting,
)
