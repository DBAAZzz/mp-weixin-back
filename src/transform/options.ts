import MagicString from 'magic-string'
import { babelParse } from 'ast-kit'
import type {
  BlockStatement,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  SpreadElement,
} from '@babel/types'
import { ON_PAGE_BACK } from '../constants'
import { MpBackConfigError } from '../errors'
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

  // —— 扫描组件选项（同名键重复时取最后一个，与对象字面量运行时语义一致；
  // 记录位置索引用于判断 spread 是否可能在运行时覆盖注入内容） ——
  let dataOption: ObjectMethod | ObjectProperty | null = null
  let methodsOption: ObjectMethod | ObjectProperty | null = null
  let onPageBackOption: ObjectMethod | ObjectProperty | null = null
  let dataIndex = -1
  let methodsIndex = -1
  let onPageBackIndex = -1
  let lastSpreadIndex = -1

  for (let index = 0; index < componentObject.properties.length; index++) {
    const prop = componentObject.properties[index]
    if (prop.type === 'SpreadElement') {
      lastSpreadIndex = index
      continue
    }
    const name = propertyName(prop)
    if (name === 'data') {
      dataOption = prop
      dataIndex = index
    }
    if (name === 'methods') {
      methodsOption = prop
      methodsIndex = index
    }
    if (name === ON_PAGE_BACK) {
      onPageBackOption = prop
      onPageBackIndex = index
    }
  }

  if (!onPageBackOption) return

  // onPageBack 之后的对象展开会在运行时覆盖 this.$options.onPageBack：
  // 构建期从显式键提取的配置与运行时实际执行的回调将来自两个不同的 onPageBack
  if (lastSpreadIndex > onPageBackIndex) {
    throw new MpBackConfigError(
      `${id}：onPageBack 之后存在对象展开（...），运行时实际生效的回调可能与构建期读取的配置不一致；` +
        `请将展开移到 onPageBack 之前`
    )
  }

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

  // —— data：注入拦截状态 ——
  // 已有 data 时必须原位注入其返回对象：在组件对象头部新增 data 键会被
  // 用户靠后的同名键覆盖（对象重名键后者胜出），拦截会静默失效，
  // 因此无法静态定位返回对象时报错而不是插入重复键。
  // 对象展开（...base）的内容静态不可知：它出现在显式键之后会在运行时覆盖注入，
  // 需要新增键时插前面会被覆盖、插后面会反向抹掉展开携带的同名选项——
  // 两个方向都产生错误行为，只能报错要求用户显式声明
  const stateProps = `__MP_BACK_SHOW_PAGE_CONTAINER__: ${cfg.initialValue}, __MP_BACK_FREQUENCY__: 1,`
  if (dataOption) {
    if (lastSpreadIndex > dataIndex) {
      throw new MpBackConfigError(
        `${id}：data 之后存在对象展开（...），注入的拦截状态可能在运行时被覆盖；请将展开移到 data 之前`
      )
    }
    const dataReturn = resolveDataReturnObject(dataOption)
    if (!dataReturn) {
      throw new MpBackConfigError(
        `${id}：data 必须是方法或返回对象字面量的函数（支持 data() { return {...} }、` +
          `data: () => ({...})、data: function () { return {...} }），否则无法注入拦截状态`
      )
    }
    ms.appendRight(base + dataReturn.start! + 1, `\n    ${stateProps}`)
  } else {
    if (lastSpreadIndex >= 0) {
      throw new MpBackConfigError(
        `${id}：组件选项使用了对象展开（...）且未显式声明 data，插件无法安全注入拦截状态；` +
          `请显式声明 data() { return {} }`
      )
    }
    ms.appendRight(
      base + componentObject.start! + 1,
      `\n  data() {\n    return { ${stateProps} }\n  },`
    )
  }

  // —— methods：注入 beforeleave 处理方法（spread 覆盖风险与 data 同理） ——
  const globalHookCode = serializeGlobalHook(context, context.getPageById(id))
  const method = buildOptionsBeforeLeaveMethod(cfg, globalHookCode)
  if (methodsOption) {
    if (lastSpreadIndex > methodsIndex) {
      throw new MpBackConfigError(
        `${id}：methods 之后存在对象展开（...），注入的处理方法可能在运行时被覆盖；请将展开移到 methods 之前`
      )
    }
    const methodsObject =
      methodsOption.type === 'ObjectProperty' && methodsOption.value.type === 'ObjectExpression'
        ? methodsOption.value
        : null
    if (!methodsObject) {
      throw new MpBackConfigError(
        `${id}：methods 必须是对象字面量，否则无法注入返回拦截的处理方法`
      )
    }
    ms.appendRight(base + methodsObject.start! + 1, `\n  ${method},`)
  } else {
    if (lastSpreadIndex >= 0) {
      throw new MpBackConfigError(
        `${id}：组件选项使用了对象展开（...）且未显式声明 methods，插件无法安全注入返回拦截的处理方法；` +
          `请显式声明 methods: {}`
      )
    }
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

/**
 * 静态定位 data 选项的返回对象字面量。
 * 支持方法简写、function 表达式和箭头函数（表达式体/块体）。
 */
function resolveDataReturnObject(dataOption: ObjectMethod | ObjectProperty): ObjectExpression | null {
  if (dataOption.type === 'ObjectMethod') {
    return findReturnObject(dataOption.body)
  }
  const value = dataOption.value
  if (value.type === 'FunctionExpression') {
    return findReturnObject(value.body)
  }
  if (value.type === 'ArrowFunctionExpression') {
    if (value.body.type === 'ObjectExpression') return value.body
    if (value.body.type === 'BlockStatement') return findReturnObject(value.body)
  }
  return null
}

function findReturnObject(block: BlockStatement): ObjectExpression | null {
  for (const stmt of block.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ObjectExpression') {
      return stmt.argument
    }
  }
  return null
}
