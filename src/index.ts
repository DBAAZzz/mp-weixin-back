import { pageContext } from './context'
import { virtualFileId } from '../utils/constant'
import type { Plugin } from 'vite'
import type { Config, UserOptions } from '../types'

function MpBackPlugin(userOptions: UserOptions = {}): Plugin {
  let context: pageContext

  const defaultOptions: Config = {
    preventDefault: false,
    frequency: 1,
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
        return `export default function onPageBack() {}`
      }
    },
    async transform(code, id) {
      if (id.includes('node_modules') || !id.includes('.vue')) {
        return
      }
      return context.transform(code, id)
    },
  } as Plugin
}

export default MpBackPlugin
