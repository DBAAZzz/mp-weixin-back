import path from 'node:path'
import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { USER_OPTIONS } from '../shared-options'
import mpBack from './resolve-mp-back'

// @dcloudio/vite-plugin-uni 是 CJS 包，导出形态是 { default: fn, runDev, runBuild, ... }。
// 本项目 package.json 设了 type:module（否则 uni 的 CLI 会把本配置按 CJS 打包，
// 进而**禁止 top-level await** —— resolve-mp-back.ts 需要它）。
// 但一旦走 ESM，这个包的 default 会被包一层，`uni()` 直接报 "uni is not a function"。
// 两种取值都兜住，避免以后换构建环境时再次踩到。
const uni = (uniModule as unknown as { default?: unknown }).default ?? uniModule

// https://vitejs.dev/config/
export default defineConfig({
  // 插件声明了 `enforce: 'pre'`，且在 buildStart 里 await loadPages()，
  // 所以它与 uni() 的先后顺序不影响页面门控 —— 页面列表在 transform 前已就绪。
  plugins: [(mpBack as unknown as (o: unknown) => never)(USER_OPTIONS), (uni as never)()],
})
