import MagicString from 'magic-string'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { File } from '@babel/types'
import { MpBackConfigError } from '../errors'
import { BEFORE_LEAVE_HANDLER } from '../constants'
import type { PageContext } from '../context'
import type { PageContainerOptions, ResolvedBackConfig, SfcBlock } from '../types'

// @babel/traverse 是 CJS 包，ESM 下 default 导出需要二次取值
const traverse: typeof _traverse = (_traverse as any).default ?? _traverse

const DEFAULT_PAGE_CONTAINER: Required<PageContainerOptions> = {
  zIndex: 1,
  overlay: false,
  duration: false,
}

export function buildPageContainerTag(options: PageContainerOptions = {}): string {
  const pc = { ...DEFAULT_PAGE_CONTAINER, ...options }
  return (
    `<page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="${pc.overlay}" ` +
    `@beforeleave="${BEFORE_LEAVE_HANDLER}" :z-index="${pc.zIndex}" :duration="${pc.duration}"></page-container>`
  )
}

/** 在 template 内容末尾（</template> 前）插入 page-container */
export function injectPageContainer(ms: MagicString, template: SfcBlock, tag: string): void {
  ms.appendLeft(template.loc.end.offset, `\n  ${tag}\n`)
}

/**
 * composition API 页面的 beforeleave 处理函数声明。
 * 用户回调通过 __MP_BACK_REGISTER__ 注册（保持用户代码原位，不做 AST 重组）。
 */
export function buildCompositionBeforeLeave(cfg: ResolvedBackConfig, globalHookCode: string): string {
  return `const ${BEFORE_LEAVE_HANDLER} = () => {
  if (!__MP_BACK_SHOW_PAGE_CONTAINER__.value) return
  if (__MP_BACK_FREQUENCY__ < ${cfg.frequency}) {
    __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
    setTimeout(() => { __MP_BACK_SHOW_PAGE_CONTAINER__.value = true }, 0)
    __MP_BACK_FREQUENCY__++
  }
  ${globalHookCode}
  if (typeof __MP_BACK_CB__ === 'function') __MP_BACK_CB__()
  ${cfg.preventDefault ? '' : 'uni.navigateBack({ delta: 1 })'}
};`
}

/**
 * options API 页面注入 methods 的 beforeleave 处理方法。
 * 用户的 onPageBack 选项保持原位，运行时经 $options 调用，
 * 同时支持函数写法和 { handler, ...options } 对象写法。
 */
export function buildOptionsBeforeLeaveMethod(cfg: ResolvedBackConfig, globalHookCode: string): string {
  return `${BEFORE_LEAVE_HANDLER}() {
    if (!this.__MP_BACK_SHOW_PAGE_CONTAINER__) return
    if (this.__MP_BACK_FREQUENCY__ < ${cfg.frequency}) {
      this.__MP_BACK_SHOW_PAGE_CONTAINER__ = false
      setTimeout(() => { this.__MP_BACK_SHOW_PAGE_CONTAINER__ = true }, 0)
      this.__MP_BACK_FREQUENCY__++
    }
    ${globalHookCode}
    const __mpBackOption = this.$options.onPageBack
    const __mpBackHandler = typeof __mpBackOption === 'function' ? __mpBackOption : __mpBackOption && __mpBackOption.handler
    if (typeof __mpBackHandler === 'function') __mpBackHandler.call(this)
    ${cfg.preventDefault ? '' : 'uni.navigateBack({ delta: 1 })'}
  }`
}

/** 序列化后的函数在页面运行时环境中可见的全局名单 */
const KNOWN_GLOBALS = new Set([
  'uni',
  'wx',
  'getApp',
  'getCurrentPages',
  'requirePlugin',
  'console',
  'JSON',
  'Math',
  'Date',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'Promise',
  'Reflect',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Error',
  'TypeError',
  'RangeError',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'NaN',
  'Infinity',
  'undefined',
  'globalThis',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI',
  'arguments',
])

/**
 * 序列化插件全局 onPageBack 钩子为页面内联调用代码。
 * - 支持箭头函数、function 表达式和对象方法简写（补 function 前缀，并正确传参）
 * - 序列化会丢失闭包，检测到未解析的外部标识符时给出构建期警告
 */
export function serializeGlobalHook(context: PageContext, page: string | null): string {
  const hook = context.config.onPageBack
  if (!hook) return ''
  if (typeof hook !== 'function') {
    throw new MpBackConfigError('插件配置项 onPageBack 必须是函数')
  }

  const source = hook.toString()
  const { expression, ast } = normalizeFunctionSource(source)
  warnOnClosureReferences(context, ast)

  const params = JSON.stringify({ page })
  return `;(${expression})(${params});`
}

/**
 * 把 Function.prototype.toString 的各种产物归一为可独立求值的函数表达式。
 * 对象方法简写（`onPageBack({ page }) {...}`）需要补 function 前缀。
 */
function normalizeFunctionSource(source: string): { expression: string; ast: File } {
  const candidates = [
    source,
    `function ${source}`,
    source.startsWith('async ') ? `async function ${source.slice('async '.length)}` : null,
  ].filter((c): c is string => c !== null)

  for (const candidate of candidates) {
    try {
      const ast = parse(`(${candidate});`, { sourceType: 'module' })
      return { expression: candidate, ast }
    } catch {
      // 尝试下一种形式
    }
  }
  throw new MpBackConfigError(
    '无法解析插件配置的 onPageBack 函数源码，请使用箭头函数、function 表达式或对象方法简写'
  )
}

/** 函数会被序列化进页面代码，闭包变量运行时不存在——检测并警告 */
function warnOnClosureReferences(context: PageContext, ast: File): void {
  const unresolved = new Set<string>()
  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return
      const name = p.node.name
      if (KNOWN_GLOBALS.has(name)) return
      if (p.scope.hasBinding(name)) return
      unresolved.add(name)
    },
  })
  if (unresolved.size > 0) {
    context.log.error(
      `插件配置的 onPageBack 引用了外部变量：${[...unresolved].join(', ')}。` +
        `该函数会被序列化注入页面，闭包变量在运行时不可用，请让函数自包含。`
    )
  }
}
