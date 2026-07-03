import { describe, expect, it, vi, afterEach } from 'vitest'
import MpBackPlugin from '../src/index'
import type { UserOptions } from '../src/index'

/** 以最小 rollup/vite 上下文驱动插件 transform */
async function transformWith(
  code: string,
  options: UserOptions = {},
  id = '/root/src/pages/index/index.vue'
) {
  const plugin = MpBackPlugin(options) as any
  plugin.configResolved({ mode: 'development', root: '/root' })
  await plugin.buildStart.call({ addWatchFile: () => {} })
  return plugin.transform.call(
    {
      warn: () => {},
      error: (message: unknown) => {
        throw new Error(String(message))
      },
    },
    code,
    id
  )
}

const setupPage = (script: string, template = '<div>页面</div>') =>
  `<template>\n  ${template}\n</template>\n\n<script setup>\n${script}\n</script>\n`

afterEach(() => {
  delete process.env.UNI_PLATFORM
  vi.restoreAllMocks()
})

describe('plugin transform', () => {
  describe('过滤与快速跳过', () => {
    it('跳过未使用 helper 的文件（不解析）', async () => {
      const result = await transformWith(setupPage(`const a = 1`))
      expect(result).toBeUndefined()
    })

    it('跳过 .vue 子请求（带 query 的 id）', async () => {
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      const result = await transformWith(code, {}, '/root/src/pages/index/index.vue?vue&type=script')
      expect(result).toBeUndefined()
    })

    it('跳过 node_modules 与非 .vue 文件', async () => {
      const code = `import onPageBack from 'mp-weixin-back-helper'`
      expect(await transformWith(code, {}, '/root/node_modules/pkg/a.vue')).toBeUndefined()
      expect(await transformWith(code, {}, '/root/src/pages/index/index.ts')).toBeUndefined()
    })

    it('平台门控：UNI_PLATFORM 非 mp-weixin 时禁用', async () => {
      process.env.UNI_PLATFORM = 'mp-alipay'
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      const result = await transformWith(code)
      expect(result).toBeUndefined()
    })

    it('本地同名 onPageBack（未 import helper）不被误处理', async () => {
      const code = setupPage(`function onPageBack() {}\nonPageBack()`)
      const result = await transformWith(code)
      expect(result).toBeUndefined()
    })

    it('模板已有 page-container 时跳过注入', async () => {
      const code = setupPage(
        `import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`,
        `<page-container :show="true"></page-container>`
      )
      const result = await transformWith(code)
      expect(result).toBeUndefined()
    })
  })

  describe('composition API 注入', () => {
    it('注入 page-container、注册函数与 onBeforeLeave，并返回 sourcemap', async () => {
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      const result = await transformWith(code)
      expect(result.code).toContain('<page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__"')
      expect(result.code).toContain('__MP_BACK_REGISTER__(() => {})')
      expect(result.code).toContain('useMpWeixinBack(true)')
      expect(result.code).toContain('uni.navigateBack({ delta: 1 })')
      expect(result.map).toBeTruthy()
      // 用户代码原文保持原位（增量编辑而非重新生成）
      expect(result.code).toContain(`import onPageBack from 'mp-weixin-back-helper'`)
    })

    it('active/inactive 调用支持嵌套括号实参', async () => {
      const code = setupPage(
        [
          `import onPageBack, { activeMpBack as mpAct, inactiveMpBack } from 'mp-weixin-back-helper'`,
          `onPageBack(() => {})`,
          `const foo = (n) => n`,
          `const start = () => mpAct(() => foo(1))`,
          `const stop = () => { inactiveMpBack() }`,
        ].join('\n')
      )
      const result = await transformWith(code)
      expect(result.code).toContain('mpAct(__MP_WEIXIN_ACTIVEBACK__, () => foo(1))')
      expect(result.code).toContain('inactiveMpBack(__MP_WEIXIN_INACTIVEBACK__)')
    })

    it('per-page 字面量配置生效', async () => {
      const code = setupPage(
        `import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {}, { preventDefault: true, frequency: 5, initialValue: false })`
      )
      const result = await transformWith(code)
      expect(result.code).toContain('useMpWeixinBack(false)')
      expect(result.code).toContain('__MP_BACK_FREQUENCY__ < 5')
      expect(result.code).not.toContain('uni.navigateBack')
    })

    it('非字面量配置给出可修复的构建错误，而不是构建期求值', async () => {
      const code = setupPage(
        `import onPageBack from 'mp-weixin-back-helper'\nconst n = 3\nonPageBack(() => {}, { frequency: n })`
      )
      await expect(transformWith(code)).rejects.toThrow(/字面量/)
    })

    it('配置项按字段校验字面量类型（frequency 必须为数字，preventDefault/initialValue 必须为布尔）', async () => {
      const page = (options: string) =>
        setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {}, ${options})`)
      await expect(transformWith(page('{ frequency: true }'))).rejects.toThrow(/frequency 必须是数字字面量/)
      await expect(transformWith(page('{ preventDefault: 2 }'))).rejects.toThrow(/preventDefault 必须是布尔字面量/)
      await expect(transformWith(page('{ initialValue: 0 }'))).rejects.toThrow(/initialValue 必须是布尔字面量/)
    })

    it('第二个参数为变量/表达式时给出构建错误，而不是静默回退全局配置', async () => {
      const viaVariable = setupPage(
        `import onPageBack from 'mp-weixin-back-helper'\nconst opts = { preventDefault: true }\nonPageBack(() => {}, opts)`
      )
      await expect(transformWith(viaVariable)).rejects.toThrow(/内联对象字面量/)

      const viaExpression = setupPage(
        `import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {}, getOpts())`
      )
      await expect(transformWith(viaExpression)).rejects.toThrow(/内联对象字面量/)
    })

    it('嵌套作用域中被遮蔽的同名标识符不被改写（binding 校验）', async () => {
      const code = setupPage(
        [
          `import onPageBack, { activeMpBack } from 'mp-weixin-back-helper'`,
          `onPageBack(() => {})`,
          `function run(onPageBack) {`,
          `  onPageBack('not plugin')`,
          `}`,
          `const use = (activeMpBack) => activeMpBack(1)`,
        ].join('\n')
      )
      const result = await transformWith(code)
      // 顶层调用（binding 来自 helper import）被改写
      expect(result.code).toContain('__MP_BACK_REGISTER__(() => {})')
      // 遮蔽的参数调用原样保留
      expect(result.code).toContain(`onPageBack('not plugin')`)
      expect(result.code).toContain('activeMpBack(1)')
      expect(result.code).not.toContain(`__MP_BACK_REGISTER__('not plugin')`)
      expect(result.code).not.toContain('activeMpBack(__MP_WEIXIN_ACTIVEBACK__, 1)')
    })
  })

  describe('全局 onPageBack 钩子序列化', () => {
    it('箭头函数带 page 参数注入', async () => {
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      const result = await transformWith(code, {
        onPageBack: ({ page }) => console.log(page),
      })
      expect(result.code).toContain('console.log(page)')
      expect(result.code).toContain('"page":')
    })

    it('对象方法简写补 function 前缀且正确传参', async () => {
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      const result = await transformWith(code, {
        // 对象方法简写：toString() 产物形如 `onPageBack({ page }) {...}`
        onPageBack({ page }) {
          console.log(page)
        },
      })
      expect(result.code).toMatch(/\(function onPageBack\(\{\s*page\s*\}\)/)
      expect(result.code).toMatch(/\)\(\{"page":.*\}\);/)
    })

    it('引用闭包变量时给出构建期警告', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const secret = 'from-closure'
      const code = setupPage(`import onPageBack from 'mp-weixin-back-helper'\nonPageBack(() => {})`)
      await transformWith(code, {
        onPageBack: () => console.log(secret),
      })
      const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n')
      expect(logged).toContain('外部变量')
      expect(logged).toContain('secret')
    })
  })

  describe('options API 注入', () => {
    it('增量注入 data 状态与 onBeforeLeave，用户代码原位保留', async () => {
      const code = `<template>\n  <div>页面</div>\n</template>\n\n<script>\nexport default {\n  data() {\n    return { a: 1 }\n  },\n  onPageBack() {\n    console.log('back')\n  },\n}\n</script>\n`
      const result = await transformWith(code)
      expect(result.code).toContain('__MP_BACK_SHOW_PAGE_CONTAINER__: true, __MP_BACK_FREQUENCY__: 1,')
      expect(result.code).toContain('this.$options.onPageBack')
      // 用户的 data/onPageBack 原文未被重新生成
      expect(result.code).toContain('return {\n    __MP_BACK_SHOW_PAGE_CONTAINER__')
      expect(result.code).toContain(`console.log('back')`)
    })

    it('无 data、无 methods 时自动补齐', async () => {
      const code = `<template>\n  <div>页面</div>\n</template>\n\n<script>\nexport default {\n  onPageBack() {},\n}\n</script>\n`
      const result = await transformWith(code)
      expect(result.code).toContain('data() {')
      expect(result.code).toContain('__MP_BACK_ON_BEFORE_LEAVE__()')
    })
  })
})
