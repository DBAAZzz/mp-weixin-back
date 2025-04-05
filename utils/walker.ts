import generate from '@babel/generator'
import MagicString from 'magic-string'
import { babelParse, walkAST } from 'ast-kit'
import { pageContext } from '../src/context'
import { virtualFileId } from './constant'
import type {
  BlockStatement,
  FunctionExpression,
  Node,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
} from '@babel/types'

const pageContainerComp =
  '  <page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>\n'

function isArrowFunction(func: Function) {
  if (typeof func !== 'function') return false
  return !func.hasOwnProperty('prototype') && func.toString().includes('=>')
}

function compositionWalk(context: pageContext, code: string, sfc: any, id: string) {
  const codeMs = new MagicString(code)
  const setupAst = babelParse(sfc.scriptSetup!.loc.source, sfc.scriptSetup!.lang)

  let pageInfo = {
    hasPageBack: false,
    pageBackFnName: 'onPageBack',
    hasImportRef: false,
    backConfig: { ...context.config },
    callbackCode: '',
    activeFnName: 'activeMpBack',
    inActiveFnName: 'inactiveMpBack',
  }

  const activeFnCallsToModify: any[] = []
  const inActiveFnCallsToModify: any[] = []

  if (setupAst) {
    walkAST<Node>(setupAst, {
      enter(node) {
        if (node.type === 'ImportDeclaration') {
          if (node.source.value.includes(virtualFileId)) {
            const importDefaultSpecifiers = node.specifiers.filter(
              (i) => i.type === 'ImportDefaultSpecifier',
            )
            const importDefaultSpecifier = importDefaultSpecifiers[0]
            pageInfo.hasPageBack = true
            pageInfo.pageBackFnName = importDefaultSpecifier.local.name

            const importSpecifiers = node.specifiers.filter((i) => i.type === 'ImportSpecifier')
            importSpecifiers.map((specifiers) => {
              if (
                specifiers.imported.type === 'Identifier' &&
                specifiers.imported.name === 'activeMpBack'
              ) {
                pageInfo.activeFnName = specifiers.local.name
              }
              if (
                specifiers.imported.type === 'Identifier' &&
                specifiers.imported.name === 'inactiveMpBack'
              ) {
                pageInfo.inActiveFnName = specifiers.local.name
              }
            })
          }
          if (node.source.value === 'vue') {
            node.specifiers.some((specifier) => {
              if (specifier.local.name === 'ref') {
                pageInfo.hasImportRef = true
                return true
              }
              return false
            })
          }
        }

        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.loc?.identifierName === pageInfo.pageBackFnName
        ) {
          const callback = node.expression.arguments[0]
          const backArguments = node.expression.arguments[1]

          if (backArguments?.type === 'ObjectExpression') {
            const config = new Function(
              // @ts-ignore
              `return (${(generate.default ? generate.default : generate)(backArguments).code});`,
            )()
            Object.assign(pageInfo.backConfig, config)
          }

          if (
            callback &&
            (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
          ) {
            const body = callback.body
            if (body.type === 'BlockStatement') {
              pageInfo.callbackCode += body.body
                .map(
                  // @ts-ignore
                  (statement) => (generate.default ? generate.default : generate)(statement).code,
                )
                .join('')
            }
          }
        }

        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.loc?.identifierName === pageInfo.activeFnName
        ) {
          activeFnCallsToModify.push({
            start: node.expression.start,
            end: node.expression.end,
            original: sfc.scriptSetup!.loc.source.substring(
              node.expression.start,
              node.expression.end,
            ),
            name: pageInfo.activeFnName,
          })
        }

        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.loc?.identifierName === pageInfo.inActiveFnName
        ) {
          inActiveFnCallsToModify.push({
            start: node.expression.start,
            end: node.expression.end,
            original: sfc.scriptSetup!.loc.source.substring(
              node.expression.start,
              node.expression.end,
            ),
            name: pageInfo.inActiveFnName,
          })
        }
      },
    })
  }

  // 没有引入mp-weixin-back-helper
  if (!pageInfo.hasPageBack) return code

  if (code.includes('<page-container')) {
    context.log.debugLog(`${context.getPageById(id)}页面已有page-container组件，注入失败`)
    return code
  }

  if (!pageInfo.backConfig.preventDefault) {
    pageInfo.callbackCode += 'uni.navigateBack({ delta: 1 });'
  }

  const importUseMpWeixinBack = `import { useMpWeixinBack } from '${virtualFileId}'`
  const importRefFromVue = !pageInfo.hasImportRef ? `import { ref } from 'vue'` : ''
  const stateFrequency = 'let __MP_BACK_FREQUENCY__ = 1;'

  const statePageContainerVar = `
    const { __MP_BACK_SHOW_PAGE_CONTAINER__, __MP_WEIXIN_ACTIVEBACK__, __MP_WEIXIN_INACTIVEBACK__ } = useMpWeixinBack(${pageInfo.backConfig.initialValue})
  `

  // 获取传入插件的统一方法
  const configBack = (() => {
    const onPageBack = pageInfo.backConfig.onPageBack
    if (!onPageBack) return ''
    if (typeof onPageBack !== 'function') {
      throw new Error('`onPageBack` must be a function')
    }
    const params = JSON.stringify({ page: context.getPageById(id) })
    if (isArrowFunction(onPageBack) || onPageBack.toString().includes('function')) {
      return `(${onPageBack})(${params});`
    }
    return `(function ${onPageBack})()`
  })()

  const stateBeforeLeave = `
    const onBeforeLeave = () => {
      if (__MP_BACK_FREQUENCY__ < ${pageInfo.backConfig.frequency}) {
        __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
        setTimeout(() => __MP_BACK_SHOW_PAGE_CONTAINER__.value = true, 0);
        __MP_BACK_FREQUENCY__++
      }
      ${configBack}
      ${pageInfo.callbackCode}
    };
  `
  const { template, scriptSetup } = sfc

  // template标签中插入page-container组件
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content,
  }
  const templateMagicString = new MagicString(tempOffsets.content)
  templateMagicString.append(pageContainerComp)
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString())

  // script标签中插入声明的变量和方法
  const scriptOffsets = {
    start: scriptSetup.loc.start.offset,
    end: scriptSetup.loc.end.offset,
    content: scriptSetup.content || '',
  }
  const scriptMagicString = new MagicString(scriptOffsets.content)
  scriptMagicString.prepend(
    ` ${importRefFromVue}
      ${importUseMpWeixinBack}
      ${stateFrequency}
      ${statePageContainerVar}
      ${stateBeforeLeave} `,
  )

  // 应用 activeMpBack 调用的修改
  activeFnCallsToModify.forEach((call) => {
    // 使用正则匹配函数调用结构，确保我们只修改括号内的内容
    const fnCallRegex = new RegExp(`${call.name}\\(([^)]*)\\)`, 'g')
    const newCall = call.original.replace(fnCallRegex, (_match: any, args: string) => {
      // 如果原调用没有参数
      if (!args.trim()) {
        return `${call.name}(__MP_WEIXIN_ACTIVEBACK__)`
      }
      // 如果有参数，添加新参数
      return `${call.name}(__MP_WEIXIN_ACTIVEBACK__, ${args})`
    })

    scriptMagicString.overwrite(call.start, call.end, newCall)
  })

  inActiveFnCallsToModify.forEach((call) => {
    // 使用正则匹配函数调用结构，确保我们只修改括号内的内容
    const fnCallRegex = new RegExp(`${call.name}\\(([^)]*)\\)`, 'g')
    const newCall = call.original.replace(fnCallRegex, (_match: any, args: string) => {
      // 如果原调用没有参数
      if (!args.trim()) {
        return `${call.name}(__MP_WEIXIN_INACTIVEBACK__)`
      }
      // 如果有参数，添加新参数
      return `${call.name}(__MP_WEIXIN_INACTIVEBACK__, ${args})`
    })

    scriptMagicString.overwrite(call.start, call.end, newCall)
  })

  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, scriptMagicString.toString())

  return codeMs.toString()
}

function optionsWalk(context: pageContext, code: string, sfc: any, id: string) {
  const codeMs = new MagicString(code)
  const ast = babelParse(sfc.script.loc.source, sfc.script.lang)

  let pageInfo = {
    hasPageBack: false,
    pageBackFnName: 'onPageBack',
    backConfig: { ...context.config },
  }

  let exportDefaultNode: ObjectExpression | null = null
  let dataMethodNode: BlockStatement | null = null
  let methodsNode: ObjectExpression | null = null
  let onPageBackNodeMethod: ObjectMethod | null = null
  let onPageBackNodeProperty: ObjectProperty | null = null

  if (ast) {
    walkAST<Node>(ast, {
      enter(node) {
        // todo需要判断使用默认选项式还是使用了setup
        if (
          node.type === 'ExportDefaultDeclaration' &&
          node.declaration.type === 'ObjectExpression'
        ) {
          exportDefaultNode = node.declaration
          const properties = node.declaration.properties

          for (let i = 0; i < properties.length; i++) {
            const element = properties[i]
            // export default 的 data()
            if (
              element.type === 'ObjectMethod' &&
              element.key.type === 'Identifier' &&
              element.key.name === 'data' &&
              element.body.type === 'BlockStatement'
            ) {
              dataMethodNode = element.body
            }
            // export default 的 methods
            if (
              element.type === 'ObjectProperty' &&
              element.key.type === 'Identifier' &&
              element.key.name === 'methods'
            ) {
              methodsNode = element.value as ObjectExpression
            }

            // 获取export default 的 onPackBack
            const blockStatementCondition =
              element.type === 'ObjectMethod' &&
              element.key.type === 'Identifier' &&
              element.key.name === pageInfo.pageBackFnName &&
              element.body.type === 'BlockStatement'

            const functionExpressionCondition =
              element.type === 'ObjectProperty' &&
              element.key.type === 'Identifier' &&
              element.key.name === pageInfo.pageBackFnName &&
              element.value.type === 'FunctionExpression'

            if (blockStatementCondition) {
              pageInfo.hasPageBack = true
              onPageBackNodeMethod = element
            }

            if (functionExpressionCondition) {
              pageInfo.hasPageBack = true
              onPageBackNodeProperty = element
            }
          }
        }
      },
    })
  }

  if (!pageInfo.hasPageBack) return

  const newDataProperty = [
    {
      type: 'ObjectProperty',
      key: { type: 'Identifier', name: '__MP_BACK_SHOW_PAGE_CONTAINER__' },
      value: { type: 'BooleanLiteral', value: true },
      computed: false,
      shorthand: false,
    },
    {
      type: 'ObjectProperty',
      key: { type: 'Identifier', name: '__MP_BACK_FREQUENCY__' },
      value: { type: 'NumericLiteral', value: 1 },
      computed: false,
      shorthand: false,
    },
  ] as ObjectProperty[]
  if (dataMethodNode) {
    const returnStatement = (dataMethodNode as BlockStatement).body.find(
      (node) => node.type === 'ReturnStatement',
    )
    if (
      returnStatement &&
      returnStatement.argument &&
      returnStatement.argument.type === 'ObjectExpression'
    ) {
      // 添加新的属性
      returnStatement.argument.properties.push(...newDataProperty)
    }
  } else if (exportDefaultNode) {
    const addData: ObjectMethod = {
      type: 'ObjectMethod',
      key: { type: 'Identifier', name: 'data' },
      kind: 'method',
      params: [],
      async: false,
      generator: false,
      computed: false,
      body: {
        type: 'BlockStatement',
        directives: [],
        body: [
          {
            type: 'ReturnStatement',
            argument: {
              type: 'ObjectExpression',
              properties: newDataProperty,
            },
          },
        ],
      },
    }
    ;(exportDefaultNode as ObjectExpression).properties.push(addData)
  }

  // 获取传入插件的统一方法
  const configBack = (() => {
    const onPageBack = pageInfo.backConfig.onPageBack
    if (!onPageBack) return ''
    if (typeof onPageBack !== 'function') {
      throw new Error('`onPageBack` must be a function')
    }
    const params = JSON.stringify({ page: context.getPageById(id) })
    if (isArrowFunction(onPageBack) || onPageBack.toString().includes('function')) {
      return `(${onPageBack})(${params});`
    }
    return `(function ${onPageBack})()`
  })()

  const stateBeforeLeave = `
    function onBeforeLeave() {
      if (this.__MP_BACK_FREQUENCY__ < ${pageInfo.backConfig.frequency}) {
        this.__MP_BACK_SHOW_PAGE_CONTAINER__ = false
        setTimeout(() => { this.__MP_BACK_SHOW_PAGE_CONTAINER__ = true }, 0);
        this.__MP_BACK_FREQUENCY__++
      }
      ${configBack}
      ${!pageInfo.backConfig.preventDefault ? 'uni.navigateBack({ delta: 1 });' : ''}
    };
  `
  const stateBeforeLeaveAst = babelParse(stateBeforeLeave)
  const stateBeforeLeaveNode = stateBeforeLeaveAst.body.find(
    (node) => node.type === 'FunctionDeclaration',
  )
  const newMethodsProperty = {
    type: 'ObjectMethod',
    key: {
      type: 'Identifier',
      name: 'onBeforeLeave',
    },
    kind: 'method',
    generator: false,
    async: false,
    params: [],
    computed: false,
    body: {
      type: 'BlockStatement',
      directives: [],
      body: [
        ...(onPageBackNodeMethod ? (onPageBackNodeMethod as ObjectMethod)!.body.body : []),
        ...(onPageBackNodeProperty
          ? ((onPageBackNodeProperty as ObjectProperty)!.value as FunctionExpression).body.body
          : []),
        ...stateBeforeLeaveNode!.body.body,
      ],
    },
  } as ObjectMethod
  if (methodsNode) {
    ;(methodsNode as ObjectExpression).properties.push(newMethodsProperty)
  } else if (exportDefaultNode) {
    const addMethods: ObjectProperty = {
      type: 'ObjectProperty',
      computed: false,
      shorthand: false,
      key: {
        type: 'Identifier',
        name: 'methods',
      },
      value: {
        type: 'ObjectExpression',
        properties: [newMethodsProperty],
      },
    }
    ;(exportDefaultNode as ObjectExpression).properties.push(addMethods)
  }

  const { template, script } = sfc

  // template标签中插入page-container组件
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content,
  }
  const templateMagicString = new MagicString(tempOffsets.content)
  templateMagicString.append(pageContainerComp)
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString())

  // script标签中插入声明的变量和方法
  const scriptOffsets = {
    start: script.loc.start.offset,
    end: script.loc.end.offset,
  }

  // @ts-ignore
  const newScriptContent = (generate.default ? generate.default : generate)(ast).code
  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, newScriptContent)

  return codeMs.toString()
}

export const vueWalker = {
  compositionWalk,
  optionsWalk,
}
