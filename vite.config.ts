import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import mpBack from './src/index'

export default defineConfig({
  plugins: [
    mpBack(),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('page-') || tag.startsWith('mp-'),
        },
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    // example 是独立工程（不进 workspace、自带依赖与 vite 版本），
    // 它的 spec 必须用它自己的配置跑：`pnpm --dir example test`。
    // 不排除的话根 vitest 会把 example/test/*.spec.ts 也收进来，
    // 在那里以仓库根为 root 启动，10 个用例全挂在「找不到 /src/main.ts」。
    exclude: ['**/node_modules/**', '**/dist/**', 'example/**'],
  },
})
