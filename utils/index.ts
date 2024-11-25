import generate from '@babel/generator'
import { parse } from '@vue/compiler-sfc'
import { babelParse, walkAST } from 'ast-kit'
import { pageContext } from '../src/context'
import MagicString from 'magic-string'
import { virtualFileId } from './constant'
import type { SFCDescriptor } from '@vue/compiler-sfc'
import type { Node } from '@babel/types'

function isArrowFunction(func: Function) {
  if (typeof func !== 'function') return false
  return !func.hasOwnProperty('prototype') && func.toString().includes('=>')
}

async function parseSFC(code: string): Promise<SFCDescriptor> {
  try {
    return parse(code).descriptor
  } catch (error) {
    throw new Error(`解析vue文件失败，请检查文件是否正确`)
  }
}

export async function transformVueFile(this: pageContext, code: string, id: string) {
  const sfc = await parseSFC(code)
  if (!sfc.template?.content) {
    return code
  }

  const componentStr =
    '  <page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>\n'

  let pageBackConfig = { ...this.config }
  let hasPageBack = false
  let hasImportRef = false
  let pageBackFnName = 'onPageBack'
  let callbackCode = ``

  const codeMs = new MagicString(code)
  const setupCode = sfc.scriptSetup?.loc.source || ''
  const setupAst = babelParse(setupCode, sfc.scriptSetup?.lang)

  if (setupAst) {
    walkAST<Node>(setupAst, {
      enter(node) {
        if (node.type === 'ImportDeclaration') {
          if (node.source.value.includes(virtualFileId)) {
            const importSpecifier = node.specifiers[0]
            hasPageBack = true
            pageBackFnName = importSpecifier.local.name
          }
          if (node.source.value === 'vue') {
            node.specifiers.some((specifier) => {
              if (specifier.local.name === 'ref') {
                hasImportRef = true
                return true
              }
              return false
            })
          }
        }

        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.loc?.identifierName === pageBackFnName
        ) {
          const callback = node.expression.arguments[0]
          const backArguments = node.expression.arguments[1]

          if (backArguments?.type === 'ObjectExpression') {
            const config = new Function(
              // @ts-ignore
              `return (${(generate.default ? generate.default : generate)(backArguments).code});`
            )()
            Object.assign(pageBackConfig, config)
          }

          if (
            callback &&
            (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
          ) {
            const body = callback.body
            if (body.type === 'BlockStatement') {
              callbackCode += body.body
                .map(
                  // @ts-ignore
                  (statement) => (generate.default ? generate.default : generate)(statement).code
                )
                .join('')
            }
          }
        }
      },
    })
  }

  if (!hasPageBack) return

  this.log.devLog(`页面${this.getPageById(id)}注入mp-weixin-back`)

  if (code.includes('<page-container')) {
    this.log.devLog(`${this.getPageById(id)}页面已有page-container组件，注入失败`)
    return code
  }

  if (!pageBackConfig.preventDefault) {
    callbackCode += `uni.navigateBack({ delta: 1 });`
  }

  const configBack = (() => {
    const onPageBack = pageBackConfig.onPageBack
    if (!onPageBack) return ''
    if (typeof onPageBack !== 'function') {
      throw new Error('`onPageBack` must be a function')
    }

    const params = JSON.stringify({ page: this.getPageById(id) })

    if (isArrowFunction(onPageBack) || onPageBack.toString().includes('function')) {
      return `(${onPageBack})(${params});`
    }

    return `(function ${onPageBack})()`
  })()

  const beforeLeaveStr = `
    ${!hasImportRef ? "import { ref } from 'vue'" : ''}
    let __MP_BACK_FREQUENCY__ = 1
    const __MP_BACK_SHOW_PAGE_CONTAINER__ = ref(true);
    const onBeforeLeave = () => {
      console.log("__MP_BACK_FREQUENCY__", __MP_BACK_FREQUENCY__, ${pageBackConfig.frequency})
      if (__MP_BACK_FREQUENCY__ < ${pageBackConfig.frequency}) {
        __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
        setTimeout(() => __MP_BACK_SHOW_PAGE_CONTAINER__.value = true, 0);
        __MP_BACK_FREQUENCY__++
      }
      ${configBack}
      ${callbackCode}
    };
  `

  const { template, script, scriptSetup } = sfc
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content,
  }

  const templateMagicString = new MagicString(tempOffsets.content)
  templateMagicString.append(componentStr)
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString())

  const scriptSfc = script || scriptSetup
  if (!scriptSfc) return

  const scriptOffsets = {
    start: scriptSfc.loc.start.offset,
    end: scriptSfc.loc.end.offset,
    content: scriptSfc.content || '',
  }

  const scriptMagicString = new MagicString(scriptOffsets.content)
  scriptMagicString.prepend(beforeLeaveStr)
  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, scriptMagicString.toString())

  return codeMs.toString()
}
