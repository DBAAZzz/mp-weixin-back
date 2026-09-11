import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type PluginOption, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import mpBack from '../../../src/index'
import type { UserOptions } from '../../../src/types'

/**
 * example 自己的转换产物测试。
 *
 * 与仓库根 test/*.spec.ts 的区别：根测试直接调插件函数、自带桩代码；
 * 这里走**真实的 Vite dev server + 真实的 pages.json 页面门控**，
 * 因此同时覆盖插件在真实 Vite 管线中的挂载、顺序、以及页面注册解析。
 * 断言对象是 README「demo 页面矩阵」里那张表 —— 那张表此前只是散文，现在有机器保障。
 *
 * 刻意不加载 vite-plugin-inspect：它是给人看的 dev UI，在测试里没有作用，
 * 且它的 configureServer 在 middlewareMode 下会抛错。
 */

// 不复用 shared-options 的 USER_OPTIONS：那份开了 debug:true，
// 而插件的 debug 是直接 console.log（src/context.ts），不经过 vite 的 logger，
// 在测试里既静音不掉也没人看。这里传等价但不打印的配置，
// 唯一差别是 debug —— 页面门控、钩子注入等被测行为完全一致。
// 用 UserOptions 而不是手写字面量类型：page 实际是 string | null，
// 手写的 `{ page: string }` 会把配置写窄，tsc 直接报错。
const TEST_OPTIONS: UserOptions = {
  onPageBack: ({ page }) => {
    console.log('[example] 全局 onPageBack 钩子，page =', page)
  },
}

let server: ViteDevServer

beforeAll(async () => {
  server = await createServer({
    root: new URL('..', import.meta.url).pathname,
    configFile: false,
    plugins: [
      mpBack(TEST_OPTIONS) as PluginOption,
      vue({
        template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('page-') } },
      }),
    ],
    server: { middlewareMode: true },
  })
})

// middlewareMode 下没有 http server，close() 会挂在等一个永不 settle 的关闭流程。
// 这里要的只是释放模块图/文件监听，主动关 watcher 后直接钳一个短超时兜底。
afterAll(async () => {
  await server?.watcher.close()
  await Promise.race([
    server?.close(),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])
}, 20_000)

/** 取某个模块经完整 Vite 管线处理后的代码 */
async function transform(modulePath: string): Promise<string> {
  const result = await server.transformRequest(modulePath)
  if (!result) throw new Error(`transformRequest 未返回结果：${modulePath}`)
  return result.code
}

/** 插件注入痕迹数（用于「零注入」判定） */
const traces = (code: string) => (code.match(/__MP_BACK_/g) ?? []).length

/**
 * 判定产物里是否存在**真实**的放行调用。
 *
 * ⚠️ 不能用 `code.includes('uni.navigateBack')`：demo 页面的说明文字
 * （<h2>/<li> 里的「出现 uni.navigateBack({ delta: 1 })」）会被原样编译进产物，
 * 全文包含式断言因此恒为真、失去意义——这正是手工 grep 时最容易踩的坑。
 * 这里只取 beforeleave 处理函数体来判。
 *
 * ⚠️ 结束位置同样不能猜。两条注入路径形态不同：
 *   - composition：`__MP_BACK_ON_BEFORE_LEAVE__ = function () { …\n};`（顶层赋值，以 `\n};` 收尾）
 *   - options：    `__MP_BACK_ON_BEFORE_LEAVE__() { …\n  },`（method 简写，收尾是 `\n  },`，没有 `\n};`）
 * 早先固定找 `\n};` 的写法在 options 页面上找不到结束点，会一路切到文件末尾，
 * 把 demo 文案里的 `uni.navigateBack` 当成真实调用 —— 假阳性。
 * 改为按花括号配对取平衡体，两种形态都能精确切出函数体。
 */
function beforeleaveBody(code: string): string {
  const start = code.indexOf('__MP_BACK_ON_BEFORE_LEAVE__')
  expect(start).toBeGreaterThanOrEqual(0)
  const open = code.indexOf('{', start)
  expect(open).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1)
  }
  throw new Error('beforeleave 函数体未闭合')
}

const hasRealNavigateBack = (code: string) => beforeleaveBody(code).includes('uni.navigateBack')

describe('注入页面', () => {
  it('index：走 vite 全局配置', async () => {
    const code = await transform('/src/pages/index/index.vue')
    expect(code).toContain('useMpWeixinBack(true)')
    expect(code).toMatch(/__MP_BACK_FREQUENCY__ < 1/)
    // 全局未开 preventDefault → 应生成放行调用（只看 beforeleave 函数体）
    expect(hasRealNavigateBack(code)).toBe(true)
    // 全局 hook 被序列化注入，且带页面路径实参
    expect(code).toContain('"page":"pages/index/index"')
  })

  it('form：per-page 字面量覆盖全局，preventDefault 生效', async () => {
    const code = await transform('/src/pages/form/form.vue')
    expect(code).toMatch(/__MP_BACK_FREQUENCY__ < 3/)
    // preventDefault: true → 不生成放行调用
    expect(hasRealNavigateBack(code)).toBe(false)
    expect(code).toContain('"page":"pages/form/form"')
  })

  it('manual：initialValue:false 与 active/inactive 改写', async () => {
    const code = await transform('/src/pages/manual/manual.vue')
    expect(code).toContain('useMpWeixinBack(false)')
    expect(code).toContain('activeMpBack(__MP_WEIXIN_ACTIVEBACK__)')
    expect(code).toContain('inactiveMpBack(__MP_WEIXIN_INACTIVEBACK__)')
  })

  it('options-shorthand：data/methods 原位注入，用户代码保留', async () => {
    const code = await transform('/src/pages/options-shorthand/index.vue')
    expect(code).toContain('__MP_BACK_SHOW_PAGE_CONTAINER__: true, __MP_BACK_FREQUENCY__: 1')
    expect(code).toContain('this.$options.onPageBack')
    expect(code).toContain('这段 data 是用户自己写的')
  })

  it('options-object：对象写法的 per-page 配置被静态提取', async () => {
    const code = await transform('/src/pages/options-object/index.vue')
    expect(code).toMatch(/this\.__MP_BACK_FREQUENCY__ < 2/)
    expect(hasRealNavigateBack(code)).toBe(false)
  })

  it('分包页面：路径拼接正确', async () => {
    const code = await transform('/src/pages-sub/detail/index.vue')
    expect(traces(code)).toBeGreaterThan(0)
    expect(code).toContain('"page":"pages-sub/detail/index"')
  })
})

describe('跳过分支（零注入）', () => {
  it('existing：已有 page-container，整体跳过', async () => {
    const code = await transform('/src/pages/existing/index.vue')
    expect(traces(code)).toBe(0)
    expect(code).toContain('onBeforeLeave')
  })

  it('plain：未使用 helper，不注入', async () => {
    const code = await transform('/src/pages/plain/index.vue')
    expect(traces(code)).toBe(0)
  })

  it('unregistered：未注册进 pages.json，被页面门控跳过', async () => {
    const code = await transform('/src/pages/unregistered/index.vue')
    expect(traces(code)).toBe(0)
    // 关键：注册调用被原样保留为死代码，不会变成 no-op 警告
    expect(code).toContain('onPageBack(')
  })
})

describe('外壳组件不参与转换', () => {
  it('main.ts 里的外壳不是页面，插件不处理', async () => {
    const code = await transform('/src/main.ts')
    expect(traces(code)).toBe(0)
  })
})
