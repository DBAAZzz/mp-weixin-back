import MagicString from 'magic-string'
import { babelParse } from 'ast-kit'
import type {
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  SpreadElement,
} from '@babel/types'
import { ON_PAGE_BACK } from '../constants'
import { extractStaticOptions } from './extract'
import {
  buildOptionsBeforeLeaveMethod,
  buildPageContainerTag,
  injectPageContainer,
  serializeGlobalHook,
} from './codegen'
import type { PageContext } from '../context'
import type { ResolvedBackConfig, SfcBlock } from '../types'

type TransformResult = { code: string; map: ReturnType<MagicString['generateMap']> } | undefined

/**
 * options API 转换。
 * 与 composition 路径同策略：MagicString 原位增量编辑，不重生成 script。
 * 用户的 onPageBack 选项保持原位，onBeforeLeave 运行时经 this.$options 调用它，
 * 支持三种写法：
 * - onPageBack() {...}（方法简写）
 * - onPageBack: function/() => {...}（函数属性）
 * - onPageBack: { handler() {...}, preventDefault, frequency, initialValue }（对象写法，支持 per-page 配置）
 */
export function optionsTransform(
  context: PageContext,
  code: string,
  template: SfcBlock,
  script: SfcBlock,
  id: string
): TransformResult {
  const base = script.loc.start.offset
  const ast = babelParse(script.content, script.lang)

  // —— 定位 export default 的组件选项对象（兼容 defineComponent 包裹） ——
  let componentObject: ObjectExpression | null = null
  for (const stmt of ast.body) {
    if (stmt.type !== 'ExportDefaultDeclaration') continue
    if (stmt.declaration.type === 'ObjectExpression') {
      componentObject = stmt.declaration
    } else if (
      stmt.declaration.type === 'CallExpression' &&
      stmt.declaration.arguments[0]?.type === 'ObjectExpression'
    ) {
      componentObject = stmt.declaration.arguments[0]
    }
  }
  if (!componentObject) return

  // —— 扫描组件选项 ——
  let dataMethod: ObjectMethod | null = null
  let methodsObject: ObjectExpression | null = null
  let onPageBackOption: ObjectMethod | ObjectProperty | null = null

  for (const prop of componentObject.properties) {
    const name = propertyName(prop)
    if (name === 'data' && prop.type === 'ObjectMethod') {
      dataMethod = prop
    }
    if (name === 'methods' && prop.type === 'ObjectProperty' && prop.value.type === 'ObjectExpression') {
      methodsObject = prop.value
    }
    if (name === ON_PAGE_BACK && (prop.type === 'ObjectMethod' || prop.type === 'ObjectProperty')) {
      onPageBackOption = prop
    }
  }

  if (!onPageBackOption) return

  // —— per-page 配置：对象写法 { handler, preventDefault, ... } 静态提取字面量 ——
  let staticOptions: Partial<ResolvedBackConfig> = {}
  if (onPageBackOption.type === 'ObjectProperty' && onPageBackOption.value.type === 'ObjectExpression') {
    staticOptions = extractStaticOptions(onPageBackOption.value, id)
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

  // —— data：注入拦截状态（有 data 方法则插入其返回对象，否则新增 data 方法） ——
  const stateProps = `__MP_BACK_SHOW_PAGE_CONTAINER__: ${cfg.initialValue}, __MP_BACK_FREQUENCY__: 1,`
  const dataReturn = dataMethod ? findDataReturnObject(dataMethod) : null
  if (dataMethod && !dataReturn) {
    context.log.error(`${id}：data() 未直接返回对象字面量，无法注入拦截状态，页面返回拦截未生效`)
    return
  }
  if (dataReturn) {
    ms.appendRight(base + dataReturn.start! + 1, `\n    ${stateProps}`)
  } else {
    ms.appendRight(
      base + componentObject.start! + 1,
      `\n  data() {\n    return { ${stateProps} }\n  },`
    )
  }

  // —— methods：注入 onBeforeLeave（有 methods 则插入，否则新增） ——
  const globalHookCode = serializeGlobalHook(context, context.getPageById(id))
  const method = buildOptionsBeforeLeaveMethod(cfg, globalHookCode)
  if (methodsObject) {
    ms.appendRight(base + methodsObject.start! + 1, `\n  ${method},`)
  } else {
    ms.appendRight(base + componentObject.start! + 1, `\n  methods: {\n  ${method},\n  },`)
  }

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true, source: id, includeContent: true }),
  }
}

function propertyName(prop: ObjectMethod | ObjectProperty | SpreadElement): string | null {
  if (prop.type === 'SpreadElement' || prop.computed) return null
  if (prop.key.type === 'Identifier') return prop.key.name
  if (prop.key.type === 'StringLiteral') return prop.key.value
  return null
}

function findDataReturnObject(dataMethod: ObjectMethod): ObjectExpression | null {
  for (const stmt of dataMethod.body.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ObjectExpression') {
      return stmt.argument
    }
  }
  return null
}
