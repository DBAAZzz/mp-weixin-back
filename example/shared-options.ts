import type { UserOptions } from '../src/types'

/**
 * demo 用的插件配置。
 * vite.config.ts 与 test/transform.spec.ts 共用这一份，
 * 避免测试与真实 dev server 用不同配置（那样测试通过也证明不了开发时看到的产物）。
 */
export const USER_OPTIONS: UserOptions = {
  // 终端打印 pages.json 加载结果与每个页面的跳过原因
  debug: true,
  onPageBack: ({ page }) => {
    // ⚠️ 这个函数会被序列化后注入到每个页面，必须自包含。
    // 一旦引用闭包变量（比如把 page 换成这里的 process.env），构建期会给出
    // 「插件配置的 onPageBack 引用了外部变量」告警——可自行取消注释观察。
    console.log('[example] 全局 onPageBack 钩子，page =', page)
  },
}
