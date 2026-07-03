import MagicString from 'magic-string'
import { babelParse, walkAST } from 'ast-kit'
import type { CallExpression, Node } from '@babel/types'
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

type TransformResult = { code: string; map: ReturnType<MagicString['generateMap']> } | undefined

/**
 * <script setup> 转换。
 * 全部编辑都是对原始 code 的 MagicString 增量修改（不重组 AST、不重生成代码），
 * 用户代码保持原位，sourcemap 逐行精确：
 * - onPageBack(cb, opts) 调用的 callee 原位改写为注入的 __MP_BACK_REGISTER__
 * - activeMpBack()/inactiveMpBack() 按 AST 精确偏移插入第一个实参
 * - 运行时声明（状态、注册函数、onBeforeLeave）前插到 script 内容头部
 */
export function compositionTransform(
  context: PageContext,
  code: string,
  template: SfcBlock,
  scriptSetup: SfcBlock,
  id: string
): TransformResult {
  const base = scriptSetup.loc.start.offset
  const ast = babelParse(scriptSetup.content, scriptSetup.lang)

  // —— 收集 helper 的 import 及各导出的本地名（仅精确匹配模块名） ——
  let onPageBackLocal: string | null = null
  let activeLocal: string | null = null
  let inactiveLocal: string | null = null

  for (const stmt of ast.body) {
    if (stmt.type !== 'ImportDeclaration' || stmt.source.value !== virtualFileId) continue
    for (const specifier of stmt.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier') {
        onPageBackLocal = specifier.local.name
      }
      if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
        if (specifier.imported.name === 'activeMpBack') activeLocal = specifier.local.name
        if (specifier.imported.name === 'inactiveMpBack') inactiveLocal = specifier.local.name
      }
    }
  }

  // 未从 helper import：本地同名 onPageBack 不做处理，避免误伤
  if (!onPageBackLocal && !activeLocal && !inactiveLocal) return

  // —— 收集需要改写的调用（任意表达式位置，不限于语句级） ——
  const registerCalls: CallExpression[] = []
  const activeCalls: CallExpression[] = []
  const inactiveCalls: CallExpression[] = []

  walkAST<Node>(ast, {
    enter(node) {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
      const name = node.callee.name
      if (onPageBackLocal && name === onPageBackLocal) registerCalls.push(node)
      else if (activeLocal && name === activeLocal) activeCalls.push(node)
      else if (inactiveLocal && name === inactiveLocal) inactiveCalls.push(node)
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
