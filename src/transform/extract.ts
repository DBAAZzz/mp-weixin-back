import type { ObjectExpression } from '@babel/types'
import { MpBackConfigError } from '../errors'
import type { OnPageBackOptions } from '../types'

/** 各配置项允许的字面量类型：类型错误会生成语义错误的代码，必须在构建期拦截 */
const OPTION_TYPES = {
  preventDefault: { nodeType: 'BooleanLiteral', label: '布尔' },
  initialValue: { nodeType: 'BooleanLiteral', label: '布尔' },
  frequency: { nodeType: 'NumericLiteral', label: '数字' },
} as const

type OptionKey = keyof typeof OPTION_TYPES

/**
 * 从 AST 静态提取 onPageBack 的字面量配置。
 * 这些配置决定构建期生成的代码形态（frequency 内联、preventDefault 决定是否
 * 生成 navigateBack 调用），因此只接受布尔/数字字面量，非字面量给出可修复的报错，
 * 不在构建期求值任何用户代码。
 */
export function extractStaticOptions(
  node: ObjectExpression,
  where: string
): Partial<OnPageBackOptions> {
  const result: Partial<OnPageBackOptions> = {}

  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      throw new MpBackConfigError(`${where}：onPageBack 配置不支持展开运算符，配置在构建期静态读取`)
    }
    // 对象写法中的 handler() {} 方法由运行时处理，这里跳过
    if (prop.type === 'ObjectMethod') continue
    if (prop.computed) {
      throw new MpBackConfigError(`${where}：onPageBack 配置不支持计算属性名，配置在构建期静态读取`)
    }

    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'StringLiteral'
          ? prop.key.value
          : null
    if (key === null) {
      throw new MpBackConfigError(`${where}：onPageBack 配置的属性名必须是标识符或字符串字面量`)
    }
    if (!(key in OPTION_TYPES)) continue

    const expected = OPTION_TYPES[key as OptionKey]
    const value = prop.value
    if (value.type === expected.nodeType) {
      ;(result as Record<string, boolean | number>)[key] = (
        value as { value: boolean | number }
      ).value
    } else {
      throw new MpBackConfigError(
        `${where}：onPageBack 配置项 ${key} 必须是${expected.label}字面量（该值在构建期读取，收到 ${value.type}）。` +
          `如需运行时控制，请使用 activeMpBack()/inactiveMpBack()`
      )
    }
  }

  return result
}
