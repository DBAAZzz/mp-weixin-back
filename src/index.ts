import { pageContext } from './context'
import { virtualFileId } from '../utils/constant'
import type { Plugin } from 'vite'
import type { Config, UserOptions } from '../types'

function MpBackPlugin(userOptions: UserOptions = {}): Plugin {
  let context: pageContext

  const defaultOptions: Config = {
    initialValue: true,
    preventDefault: false,
    frequency: 1,
    debug: false,
  }
  const options = { ...defaultOptions, ...userOptions }

  return {
    name: 'vite-plugin-mp-weixin-back',
    enforce: 'pre',
    configResolved(config) {
      context = new pageContext({ ...options, mode: config.mode, root: config.root })
    },
    buildStart() {
      context.getPagesJsonInfo()
    },
    resolveId(id) {
      if (id === virtualFileId) {
        return virtualFileId
      }
    },
    load(id) {
      if (id.includes('node_modules')) {
        return
      }
      // 导出一个对象
      if (id === virtualFileId) {
        return `
          import { ref } from 'vue'
          export default function onPageBack() {}
          export function activeMpBack(fn = null) {
            fn?.()
          }
          export function inactiveMpBack(fn = null) {
            fn?.()
          }
          export function useMpWeixinBack(initialValue = true) {
            const __MP_BACK_SHOW_PAGE_CONTAINER__ = ref(initialValue)

            const __MP_WEIXIN_ACTIVEBACK__ = () => {
              __MP_BACK_SHOW_PAGE_CONTAINER__.value = true
            }

            const __MP_WEIXIN_INACTIVEBACK__ = () => {
              __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
            }

            return {
              __MP_BACK_SHOW_PAGE_CONTAINER__,
              __MP_WEIXIN_ACTIVEBACK__,
              __MP_WEIXIN_INACTIVEBACK__
            }
          }
        `
      }
    },
    async transform(code, id) {
      if (id.includes('node_modules') || !id.includes('.vue')) {
        return
      }

      return {
        code: await context.transform(code, id),
        map: null,
      }
    },
  } as Plugin
}

export default MpBackPlugin
