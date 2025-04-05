import { parse } from '@vue/compiler-sfc'
import { pageContext } from '../src/context'
import { vueWalker } from './walker'

export async function transformVueFile(this: pageContext, code: string, id: string) {
  try {
    const sfc = parse(code).descriptor
    const { template, script, scriptSetup } = sfc
    if (!template?.content) {
      return code
    }

    if (!script?.content && !scriptSetup?.content) {
      return code
    }

    // 判断页面是否为组合式写法
    const walker = scriptSetup ? 'compositionWalk' : 'optionsWalk'
    return vueWalker[walker](this, code, sfc, id)
  } catch (error) {
    this.log.error('解析vue文件失败，请检查文件是否正确')
    this.log.debugLog(String(error))
    return code
  }
}
