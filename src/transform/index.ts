import { resolveCompiler } from '../compiler'
import { compositionTransform } from './composition'
import { optionsTransform } from './options'
import type { PageContext } from '../context'
import type { SfcBlock } from '../types'

/**
 * 转换入口：页面门控 → SFC 解析 → 按 script 写法分发。
 * 配置类错误（MpBackConfigError）向上抛给插件层终止构建，其余错误同样上抛、
 * 由插件层降级为警告。
 */
export async function transformVueFile(context: PageContext, code: string, id: string) {
  // 页面门控：page-container 仅页面级可用。有 pages.json 时非页面直接跳过；
  // 没有 pages.json（测试环境/非常规布局）时不做过滤
  if (context.hasPages && context.getPageById(id) === null) {
    context.log.debugLog(`${id} 不是 pages.json 中注册的页面，跳过注入`)
    return
  }

  const compiler = await resolveCompiler(context.config.root)
  const { descriptor } = compiler.parse(code, { filename: id })
  const template = descriptor.template as SfcBlock | null
  const script = descriptor.script as SfcBlock | null
  const scriptSetup = descriptor.scriptSetup as SfcBlock | null

  if (!template?.content) return

  if (template.content.includes('<page-container')) {
    context.log.debugLog(`${id} 页面已有 page-container 组件，跳过注入`)
    return
  }

  // Vue 允许 <script> 与 <script setup> 并存：composition 路径优先，
  // 它未实际处理（setup 中没有 onPageBack 注册）时回落到 options 路径，
  // 处理普通 <script> 里的 onPageBack 选项
  if (scriptSetup?.content) {
    const result = compositionTransform(context, code, template, scriptSetup, id)
    if (result) return result
  }
  if (script?.content) {
    return optionsTransform(context, code, template, script, id)
  }
}
