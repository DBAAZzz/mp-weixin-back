import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import mpBack from './dist/index.mjs'

export default defineConfig({
  plugins: [mpBack(), vue()],
  test: {
    environment: 'happy-dom',
  },
})
