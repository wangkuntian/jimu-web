import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.spec.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // Element Plus 必须内联：否则它会走 Node ESM/CJS 互操作解析 async-validator，
      // 拿到的是 { default } 而不是构造函数（`new AsyncValidator(...)` 抛错又被
      // el-form 静默吞掉），jsdom 下 validate() 对空必填项也 resolve(true)，
      // 表单校验用例就变成永远通过的空断言。
      server: {
        deps: {
          inline: ['element-plus'],
        },
      },
    },
  }),
)
