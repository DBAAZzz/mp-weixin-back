import { PageContext } from './context'
import { virtualFileId, resolvedVirtualFileId, ON_PAGE_BACK } from './constants'
import { MpBackConfigError } from './errors'
import type { Plugin } from 'vite'
import type { Config, UserOptions } from './types'

function virtualModuleCode(dev: boolean): string {
  return `
import { ref } from 'vue'
const __MP_BACK_DEV__ = ${dev}
function __mpBackWarn(name) {
  if (__MP_BACK_DEV__) {
    console.warn('[mp-weixin-back] ' + name + ' 未生效：该文件未被插件编译处理。请确认它是 pages.json 中注册的页面，且当前构建平台为 mp-weixin。')
  }
}
export default function onPageBack() { __mpBackWarn('onPageBack') }
export function activeMpBack(fn) {
  if (typeof fn === 'function') fn()
  else __mpBackWarn('activeMpBack')
}
export function inactiveMpBack(fn) {
  if (typeof fn === 'function') fn()
  else __mpBackWarn('inactiveMpBack')
}
export function useMpWeixinBack(initialValue = true) {
  const __MP_BACK_SHOW_PAGE_CONTAINER__ = ref(initialValue)
  const __MP_WEIXIN_ACTIVEBACK__ = () => { __MP_BACK_SHOW_PAGE_CONTAINER__.value = true }
  const __MP_WEIXIN_INACTIVEBACK__ = () => { __MP_BACK_SHOW_PAGE_CONTAINER__.value = false }
  return { __MP_BACK_SHOW_PAGE_CONTAINER__, __MP_WEIXIN_ACTIVEBACK__, __MP_WEIXIN_INACTIVEBACK__ }
}
`
}

function MpBackPlugin(userOptions: UserOptions = {}): Plugin {
  let context: PageContext
  // page-container 是微信小程序专属组件：uni-app 多端构建时仅在 mp-weixin 下转换。
  // 未设置 UNI_PLATFORM（纯 Vite/测试环境）时默认启用
  let enabled = true

  const defaultOptions: Config = {
    initialValue: true,
    preventDefault: false,
    frequency: 1,
    debug: false,
  }
  const options: Config = { ...defaultOptions, ...userOptions }

  return {
    name: 'vite-plugin-mp-weixin-back',
    enforce: 'pre',

    configResolved(config) {
      const platform = process.env.UNI_PLATFORM
      enabled = !platform || platform === 'mp-weixin'
      context = new PageContext({ ...options, mode: config.mode, root: config.root })
      if (!enabled) {
        context.log.info(`当前构建平台为 ${platform}，插件已禁用（保留 no-op API 以保证代码可编译）`)
      }
    },

    buildStart() {
      if (context.pagesJsonPath) {
        this.addWatchFile(context.pagesJsonPath)
      }
      // 返回 Promise：确保 transform 执行前页面列表已加载完成
      return context.loadPages()
    },

    async watchChange(id) {
      if (context.isPagesJson(id)) {
        await context.loadPages()
      }
    },

    resolveId(id) {
      if (id === virtualFileId) {
        return resolvedVirtualFileId
      }
    },

    load(id) {
      if (id === resolvedVirtualFileId) {
        return virtualModuleCode(context.config.mode !== 'production')
      }
    },

    async transform(code, id) {
      if (!enabled) return
      const [filename, rawQuery] = id.split('?', 2)
      if (filename.includes('node_modules')) return
      if (!filename.endsWith('.vue')) return
      // 只处理原始 SFC 请求，跳过 @vitejs/plugin-vue 的子请求（?vue&type=script 等）
      if (rawQuery && new URLSearchParams(rawQuery).has('vue')) return
      // 快速跳过：既没有 import helper（composition），也没有 onPageBack 选项（options API）
      if (!code.includes(virtualFileId) && !code.includes(ON_PAGE_BACK)) return

      try {
        return await context.transform(code, id)
      } catch (error) {
        if (error instanceof MpBackConfigError) {
          // 用户配置错误：终止构建并给出可修复的提示（dev 下显示为 Vite overlay）
          this.error(`[mp-weixin-back] ${error.message}`)
        }
        const message = error instanceof Error ? error.message : String(error)
        context.log.error(`Failed to transform ${id}: ${message}`)
        this.warn(`[mp-weixin-back] 转换 ${id} 失败，该页面的返回拦截未生效：${message}`)
        return
      }
    },
  }
}

export default MpBackPlugin
export type { UserOptions, Config, BackParams, OnPageBackOptions, PageContainerOptions } from './types'
