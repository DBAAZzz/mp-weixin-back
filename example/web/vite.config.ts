import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import inspect from 'vite-plugin-inspect'
import { USER_OPTIONS } from '../shared-options'

// 默认直接用插件源码：免构建，且始终反映仓库当前改动。
// 想验证真正发布出去的产物（dist + package.json exports）时，先在仓库根目录 pnpm build，再：
//   MP_BACK_USE_DIST=1 pnpm dev
const useDist = process.env.MP_BACK_USE_DIST === '1'

// 用配置文件自身的位置推 dist，而不是 process.cwd()——
// 后者在「从仓库根目录调用」时会算成仓库外一级的路径
const distPath = path.resolve(import.meta.dirname, '../../dist/index.mjs')

if (useDist && !fs.existsSync(distPath)) {
  throw new Error(
    `[example] 未找到 ${distPath}\n` +
      `MP_BACK_USE_DIST=1 需要先构建插件：在仓库根目录执行 pnpm build`
  )
}

const mpBack = useDist
  ? (
      await import(
        // 变量形式 + 绝对 file URL：esbuild 打包本配置文件时不会静态解析该路径
        // （dist 可能尚未构建）
        pathToFileURL(distPath).href
      )
    ).default
  : (await import('../../src/index')).default


export default defineConfig({
  plugins: [
    mpBack(USER_OPTIONS),
    vue({
      template: {
        compilerOptions: {
          // page-container 是微信小程序自定义组件，web 上要告知 Vue 编译器，
          // 否则注入的标签会被当成未解析组件
          isCustomElement: (tag) => tag.startsWith('page-'),
        },
      },
    }),
    inspect(),
  ],
  server: {
    // example 不是 pnpm workspace 成员，显式允许 dev server serve 到仓库根的 ../../src。
    // fs.allow 是**白名单**：给了 '..' 只放开 example/web 的父目录（= example），
    // 仓库根的 src 仍在白名单外，dev 会直接 403。所以这里必须一路放到仓库根。
    fs: { allow: ['../..'] },
  },
})
