import generate from '@babel/generator'
import { parse } from '@vue/compiler-sfc'
import { babelParse, walkAST } from 'ast-kit'
import { pageContext } from '../src/context'
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
  // 检查代码中是否已经包含page-container组件
  if (code.includes('<page-container')) {
    return code
  }

  // 检查是否包含template标签
  if (!code.includes('<template')) {
    return code
  }

  const componentStr =
    '<page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>'

  const sfc = await parseSFC(code)
  const setupCode = sfc.scriptSetup?.loc.source
  const setupAst = babelParse(setupCode || '', sfc.scriptSetup?.lang)
  let pageBackConfig = this.config
  let hasPageBack = false,
    hasImportRef = false,
    pageBackFnName = 'onPageBack',
    callbackCode = ``

  if (setupAst) {
    walkAST<Node>(setupAst, {
      enter(node) {
        if (node.type == 'ImportDeclaration' && node.source.value.includes(virtualFileId)) {
          const importSpecifier = node.specifiers[0]
          hasPageBack = true
          pageBackFnName = importSpecifier.local.name
        }

        if (node.type == 'ImportDeclaration' && node.source.value === 'vue') {
          const importSpecifiers = node.specifiers
          for (let i = 0; i < importSpecifiers.length; i++) {
            const element = importSpecifiers[i]
            if (element.local.name == 'ref') {
              hasImportRef = true
              break
            }
          }
        }

        if (
          node.type == 'ExpressionStatement' &&
          node.expression.type == 'CallExpression' &&
          node.expression.callee.loc?.identifierName == pageBackFnName
        ) {
          const callback = node.expression.arguments[0] // 获取第一个参数
          const backArguments = node.expression.arguments[1]
          // 第二个参数为object才有效，覆盖插件传入的配置
          if (backArguments && backArguments.type == 'ObjectExpression') {
            const config = new Function(`return (${generate(backArguments).code});`)()
            pageBackConfig = { ...pageBackConfig, ...config }
          }

          if (
            callback &&
            (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
          ) {
            const body = callback.body
            if (body.type === 'BlockStatement') {
              // 遍历 BlockStatement 的内容
              body.body.forEach((statement) => {
                callbackCode += generate(statement).code // 将 AST 节点生成代码
              })
            }
          }
        }
      },
    })
  }

  if (!hasPageBack) return

  this.log.devLog(`页面${this.getPageById(id)}注入mp-weixin-back`)

  // 不阻止默认行为就返回到上一层
  if (!pageBackConfig.preventDefault) {
    callbackCode += `uni.navigateBack({ delta: 1 });`
  }

  // 处理统一的返回方法
  const configBack = (() => {
    if (!pageBackConfig.onPageBack) return ''
    if (typeof pageBackConfig.onPageBack !== 'function') {
      throw new Error('`onPageBack` must be a function')
    }

    const params = JSON.stringify({
      page: this.getPageById(id),
    })

    const hasFunction = pageBackConfig.onPageBack.toString().includes('function')

    if (isArrowFunction(pageBackConfig.onPageBack) || hasFunction) {
      return `(${pageBackConfig.onPageBack})(${params});`
    }

    return `(function ${pageBackConfig.onPageBack})()`
  })()

  const beforeLeaveStr = `
    ${!hasImportRef ? "import { ref } from 'vue'" : ''}
    let __MP_BACK_FREQUENCY__ = 1
    const __MP_BACK_SHOW_PAGE_CONTAINER__ = ref(true);
    const onBeforeLeave = () => {
      console.log("__MP_BACK_FREQUENCY__", __MP_BACK_FREQUENCY__, ${pageBackConfig.frequency})
      if (__MP_BACK_FREQUENCY__ < ${pageBackConfig.frequency}) {
        __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
        setTimeout(() => {
          __MP_BACK_SHOW_PAGE_CONTAINER__.value = true
        }, 0);
        __MP_BACK_FREQUENCY__++
      }
      // 运行配置的匿名函数
      ${configBack}
      ${callbackCode}
    };
  `

  // 在template标签后插入page-container组件和script setup声明
  const result = code.replace(
    /(<template.*?>)([\s\S]*?)(<\/template>)([\s\S]*?)(<script\s+(?:lang="ts"\s+)?setup.*?>|$)/,
    (match, templateStart, templateContent, templateEnd, middleContent, scriptSetup) => {
      // 处理script setup标签
      const hasScriptSetup = Boolean(scriptSetup)
      const scriptStartTag = hasScriptSetup ? scriptSetup : '<script setup>'
      const scriptEndTag = hasScriptSetup ? '' : '</script>'

      // 构建注入的内容
      const injectedTemplate = `${templateStart}${templateContent}\n ${componentStr}\n${templateEnd}`
      const injectedScript = `\n${middleContent}${scriptStartTag}\n${beforeLeaveStr}\n${scriptEndTag}`

      return injectedTemplate + injectedScript
    }
  )

  return result
}
