import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import mpBack from './dist/index.mjs'

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
