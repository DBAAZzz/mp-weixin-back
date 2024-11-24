import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  sourcemap: false, // 生成 sourcemap
  dts: {
    resolve: true
  },
  clean: true, // 构建前清理 dist 目录
  minify: false, // 是否压缩代码
  target: 'es6',
  external: ['vite'] // 标记 Vite 为外部依赖，避免打包到插件中
})

