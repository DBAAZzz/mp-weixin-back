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
  },
})
