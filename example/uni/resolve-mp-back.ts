import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 解析要加载的 mp-weixin-back 实现。
 *
 * 单独放一个文件，是因为它需要 top-level await，而 uni-app 的 CLI 会把
 * vite.config.ts 打包成 **CJS**，CJS 不支持 top-level await（实测报错
 * `Top-level await is currently not supported with the "cjs" output format`）。
 * 这个文件被 vite.config.ts **同步 import**，由 esbuild 一并打包时不受影响。
 *
 * 默认直接用插件源码：免构建，且始终反映仓库当前改动。
 * 想验证真正发布出去的产物（dist + package.json exports）时，
 * 先在仓库根目录 pnpm build，再 MP_BACK_USE_DIST=1 启动。
 */
const useDist = process.env.MP_BACK_USE_DIST === '1'
const distPath = path.resolve(import.meta.dirname, '../../dist/index.mjs')

if (useDist && !fs.existsSync(distPath)) {
  throw new Error(
    `[example/uni] 未找到 ${distPath}\n` +
      `MP_BACK_USE_DIST=1 需要先构建插件：在仓库根目录执行 pnpm build`
  )
}

const mpBack = useDist
  ? (await import(pathToFileURL(distPath).href)).default
  : (await import('../../src/index')).default

export default mpBack
