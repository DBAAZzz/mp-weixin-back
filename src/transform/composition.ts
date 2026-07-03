import MagicString from 'magic-string'
import { parse, type ParserPlugin } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type { CallExpression, File, ImportDeclaration } from '@babel/types'
import { virtualFileId } from '../constants'
import { extractStaticOptions } from './extract'
import {
  buildCompositionBeforeLeave,
  buildPageContainerTag,
  injectPageContainer,
  serializeGlobalHook,
} from './codegen'
import type { PageContext } from '../context'
import type { ResolvedBackConfig, SfcBlock } from '../types'

// @babel/traverse 是 CJS 包，ESM 下 default 导出需要二次取值
const traverse: typeof _traverse = (_traverse as any).default ?? _traverse

type TransformResult = { code: string; map: ReturnType<MagicString['generateMap']> } | undefined

type HelperExport = 'onPageBack' | 'activeMpBack' | 'inactiveMpBack'

/**
 * <script setup> 转换。
 * 全部编辑都是对原始 code 的 MagicString 增量修改（不重组 AST、不重生成代码），
 * 用户代码保持原位，sourcemap 逐行精确：
 * - onPageBack(cb, opts) 调用的 callee 原位改写为注入的 __MP_BACK_REGISTER__
 * - activeMpBack()/inactiveMpBack() 按 AST 精确偏移插入第一个实参
 * - 运行时声明（状态、注册函数、onBeforeLeave）前插到 script 内容头部
 *
 * 调用识别基于 Babel 作用域分析：仅当 callee 的 binding 确实是
 * mp-weixin-back-helper 的 import specifier 时才改写，嵌套作用域中的
 * 同名参数/局部变量不受影响。
 */
export function compositionTransform(
  context: PageContext,
  code: string,
  template: SfcBlock,
  scriptSetup: SfcBlock,
  id: string
): TransformResult {
  const base = scriptSetup.loc.start.offset
  const ast = parseScript(scriptSetup.content, scriptSetup.lang)

  // 快速门控：没有来自 helper 的 import 就不处理（本地同名函数不误伤）
  const hasHelperImport = ast.program.body.some(
    (stmt) => stmt.type === 'ImportDeclaration' && stmt.source.value === virtualFileId
  )
  if (!hasHelperImport) return

  // —— 基于 binding 收集需要改写的调用（任意表达式位置，不限于语句级） ——
  const registerCalls: CallExpression[] = []
  const activeCalls: CallExpression[] = []
  const inactiveCalls: CallExpression[] = []

  traverse(ast, {
    CallExpression(path) {
      const exportName = resolveHelperCallee(path)
      if (exportName === 'onPageBack') registerCalls.push(path.node)
      else if (exportName === 'activeMpBack') activeCalls.push(path.node)
      else if (exportName === 'inactiveMpBack') inactiveCalls.push(path.node)
    },
  })

  // —— 静态提取 per-page 配置（仅取第一个带配置的调用） ——
  let staticOptions: Partial<ResolvedBackConfig> = {}
  let optionsFound = false
  for (const call of registerCalls) {
    const optionsArg = call.arguments[1]
    if (optionsArg?.type === 'ObjectExpression') {
      if (optionsFound) {
        context.log.error(`${id}：onPageBack 被多次传入配置，仅第一处生效`)
        continue
      }
      staticOptions = extractStaticOptions(optionsArg, id)
      optionsFound = true
    }
  }

  const cfg: ResolvedBackConfig = {
    preventDefault: context.config.preventDefault,
    frequency: context.config.frequency,
    initialValue: context.config.initialValue,
    ...staticOptions,
  }

  const ms = new MagicString(code)

  // —— template：注入 page-container ——
  injectPageContainer(ms, template, buildPageContainerTag(context.config.pageContainer))

  // —— onPageBack(...) 原位改写为注册调用（回调保持原位，闭包/内部调用不受影响） ——
  for (const call of registerCalls) {
    ms.overwrite(base + call.callee.start!, base + call.callee.end!, '__MP_BACK_REGISTER__')
  }

  // —— active/inactive 调用按精确偏移插入控制函数实参 ——
  for (const call of activeCalls) {
    insertFirstArgument(ms, base, call, '__MP_WEIXIN_ACTIVEBACK__')
  }
  for (const call of inactiveCalls) {
    insertFirstArgument(ms, base, call, '__MP_WEIXIN_INACTIVEBACK__')
  }

  // —— script 头部注入运行时声明 ——
  const globalHookCode = serializeGlobalHook(context, context.getPageById(id))
  const injected = `
import { useMpWeixinBack } from '${virtualFileId}';
let __MP_BACK_FREQUENCY__ = 1;
let __MP_BACK_CB__ = null;
const __MP_BACK_REGISTER__ = (cb) => { __MP_BACK_CB__ = cb };
const { __MP_BACK_SHOW_PAGE_CONTAINER__, __MP_WEIXIN_ACTIVEBACK__, __MP_WEIXIN_INACTIVEBACK__ } = useMpWeixinBack(${cfg.initialValue});
${buildCompositionBeforeLeave(cfg, globalHookCode)}
`
  ms.appendRight(base, injected)

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true, source: id, includeContent: true }),
  }
}

function parseScript(content: string, lang?: string): File {
  const plugins: ParserPlugin[] = []
  if (lang === 'ts' || lang === 'tsx') plugins.push('typescript')
  if (lang === 'jsx' || lang === 'tsx') plugins.push('jsx')
  return parse(content, { sourceType: 'module', plugins })
}

/**
 * 判定调用的 callee 是否解析到 mp-weixin-back-helper 的某个导出。
 * 通过作用域 binding 校验声明来源，而不是名字匹配。
 */
function resolveHelperCallee(path: NodePath<CallExpression>): HelperExport | null {
  const callee = path.node.callee
  if (callee.type !== 'Identifier') return null

  const binding = path.scope.getBinding(callee.name)
  if (!binding) return null

  const declaration = binding.path
  const parent = declaration.parent as ImportDeclaration | undefined
  if (parent?.type !== 'ImportDeclaration' || parent.source.value !== virtualFileId) return null

  if (declaration.isImportDefaultSpecifier()) return 'onPageBack'
  if (declaration.isImportSpecifier()) {
    const imported = declaration.node.imported
    if (imported.type === 'Identifier') {
      if (imported.name === 'activeMpBack') return 'activeMpBack'
      if (imported.name === 'inactiveMpBack') return 'inactiveMpBack'
    }
  }
  return null
}

/** 在调用表达式的实参列表头部插入一个标识符（有实参插在首参前，无实参插在右括号前） */
function insertFirstArgument(
  ms: MagicString,
  base: number,
  call: CallExpression,
  name: string
): void {
  const firstArg = call.arguments[0]
  if (firstArg) {
    ms.appendLeft(base + firstArg.start!, `${name}, `)
  } else {
    ms.appendLeft(base + call.end! - 1, name)
  }
}
