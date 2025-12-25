import { createRequire } from 'module'
import { pageContext } from '../src/context'
import { vueWalker } from './walker'

let compilerPromise: Promise<typeof import('@vue/compiler-sfc')> | null = null

async function resolveCompiler(root: string): Promise<typeof import('@vue/compiler-sfc')> {
  // 避免重复解析（防止并发调用时的竞态条件）
  if (compilerPromise) {
    return compilerPromise
  }

  compilerPromise = (async () => {
    // 尝试加载用户项目中的 @vue/compiler-sfc
    try {
      const _require = createRequire(import.meta.url)
      // 尝试从用户根目录解析
      const compilerPath = _require.resolve('@vue/compiler-sfc', { paths: [root] })
      return _require(compilerPath) as typeof import('@vue/compiler-sfc')
    } catch (firstError) {
      try {
        // 降级尝试直接 import
        return await import('@vue/compiler-sfc')
      } catch (secondError) {
        throw new Error(
          `无法解析 @vue/compiler-sfc。\n` +
            `此插件需要项目中安装 @vue/compiler-sfc。\n` +
            `请手动安装：pnpm add -D @vue/compiler-sfc\n`
        )
      }
    }
  })()

  return compilerPromise
}

export async function transformVueFile(this: pageContext, code: string, id: string) {
  try {
    const sfcCompiler = await resolveCompiler(this.config.root)
    const sfc = sfcCompiler.parse(code).descriptor
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
    this.log.error(String(error))
    return code
  }
}
