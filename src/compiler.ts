import { createRequire } from 'module'

let compilerPromise: Promise<typeof import('@vue/compiler-sfc')> | null = null

export async function resolveCompiler(root: string): Promise<typeof import('@vue/compiler-sfc')> {
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
    } catch {
      try {
        // 降级尝试直接 import
        return await import('@vue/compiler-sfc')
      } catch {
        throw new Error(
          `[mp-weixin-back] Cannot resolve @vue/compiler-sfc.\n` +
            `This plugin requires @vue/compiler-sfc to be installed in your project.\n` +
            `Fix: pnpm add -D @vue/compiler-sfc\n` +
            `Docs: https://github.com/DBAAZzz/mp-weixin-back#%EF%B8%8F-vite-配置\n`
        )
      }
    }
  })()

  return compilerPromise
}
