import path from 'path';
import fs from 'fs';
import JSON5 from 'json5';
import { white, red, green } from 'kolorist';
import { parse } from '@vue/compiler-sfc';
import generate from '@babel/generator';
import MagicString from 'magic-string';
import { babelParse, walkAST } from 'ast-kit';

const virtualFileId = "mp-weixin-back-helper";

const pageContainerComp = '  <page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>\n';
function isArrowFunction(func) {
  if (typeof func !== "function")
    return false;
  return !func.hasOwnProperty("prototype") && func.toString().includes("=>");
}
function compositionWalk(context, code, sfc, id) {
  const codeMs = new MagicString(code);
  const setupAst = babelParse(sfc.scriptSetup.loc.source, sfc.scriptSetup.lang);
  let pageInfo = {
    hasPageBack: false,
    pageBackFnName: "onPageBack",
    hasImportRef: false,
    backConfig: { ...context.config },
    onPageBackBodyAst: [],
    onPageBackCallNodeToRemove: null,
    activeFnName: "activeMpBack",
    inActiveFnName: "inactiveMpBack"
  };
  const activeFnCallsToModify = [];
  const inActiveFnCallsToModify = [];
  if (setupAst) {
    walkAST(setupAst, {
      enter(node) {
        if (node.type === "ImportDeclaration") {
          if (node.source.value.includes(virtualFileId)) {
            const importDefaultSpecifiers = node.specifiers.filter(
              (i) => i.type === "ImportDefaultSpecifier"
            );
            const importDefaultSpecifier = importDefaultSpecifiers[0];
            pageInfo.hasPageBack = true;
            pageInfo.pageBackFnName = importDefaultSpecifier.local.name;
            const importSpecifiers = node.specifiers.filter((i) => i.type === "ImportSpecifier");
            importSpecifiers.map((specifiers) => {
              if (specifiers.imported.type === "Identifier" && specifiers.imported.name === "activeMpBack") {
                pageInfo.activeFnName = specifiers.local.name;
              }
              if (specifiers.imported.type === "Identifier" && specifiers.imported.name === "inactiveMpBack") {
                pageInfo.inActiveFnName = specifiers.local.name;
              }
            });
          }
          if (node.source.value === "vue") {
            node.specifiers.some((specifier) => {
              if (specifier.local.name === "ref") {
                pageInfo.hasImportRef = true;
                return true;
              }
              return false;
            });
          }
        }
        if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.loc?.identifierName === pageInfo.pageBackFnName) {
          pageInfo.onPageBackCallNodeToRemove = node;
          const callback = node.expression.arguments[0];
          const backArguments = node.expression.arguments[1];
          if (backArguments?.type === "ObjectExpression") {
            const config = new Function(
              // @ts-ignore
              `return (${(generate.default ? generate.default : generate)(backArguments).code});`
            )();
            Object.assign(pageInfo.backConfig, config);
          }
          if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
            pageInfo.onPageBackBodyAst = callback.body.body;
          }
          return;
        }
        if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.loc?.identifierName === pageInfo.activeFnName) {
          activeFnCallsToModify.push({
            start: node.expression.start,
            end: node.expression.end,
            original: sfc.scriptSetup.loc.source.substring(
              node.expression.start,
              node.expression.end
            ),
            name: pageInfo.activeFnName
          });
        }
        if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.loc?.identifierName === pageInfo.inActiveFnName) {
          inActiveFnCallsToModify.push({
            start: node.expression.start,
            end: node.expression.end,
            original: sfc.scriptSetup.loc.source.substring(
              node.expression.start,
              node.expression.end
            ),
            name: pageInfo.inActiveFnName
          });
        }
      }
    });
  }
  if (!pageInfo.hasPageBack)
    return code;
  if (pageInfo.onPageBackCallNodeToRemove) {
    const scriptSetupOffset = sfc.scriptSetup.loc.start.offset;
    const nodeToRemove = pageInfo.onPageBackCallNodeToRemove;
    const globalStart = scriptSetupOffset + nodeToRemove.start;
    const globalEnd = scriptSetupOffset + nodeToRemove.end;
    codeMs.remove(globalStart, globalEnd);
  }
  let callbackCode = "";
  if (pageInfo.onPageBackBodyAst.length > 0) {
    const tempAstRoot = {
      type: "BlockStatement",
      body: pageInfo.onPageBackBodyAst
    };
    walkAST(tempAstRoot, {
      enter(node) {
        if (node.type === "CallExpression" && node.callee.type === "Identifier") {
          const createIdentifier = (name) => ({ type: "Identifier", name });
          if (node.callee.name === pageInfo.activeFnName) {
            node.arguments.unshift(createIdentifier("__MP_WEIXIN_ACTIVEBACK__"));
          } else if (node.callee.name === pageInfo.inActiveFnName) {
            node.arguments.unshift(createIdentifier("__MP_WEIXIN_INACTIVEBACK__"));
          }
        }
      }
    });
    callbackCode = pageInfo.onPageBackBodyAst.map((statement) => (generate.default ? generate.default : generate)(statement).code).join("\n");
  }
  if (code.includes("<page-container")) {
    context.log.debugLog(`${context.getPageById(id)}\u9875\u9762\u5DF2\u6709page-container\u7EC4\u4EF6\uFF0C\u6CE8\u5165\u5931\u8D25`);
    return code;
  }
  if (!pageInfo.backConfig.preventDefault) {
    callbackCode += "uni.navigateBack({ delta: 1 });";
  }
  const importUseMpWeixinBack = `import { useMpWeixinBack } from '${virtualFileId}'`;
  const importRefFromVue = !pageInfo.hasImportRef ? `import { ref } from 'vue'` : "";
  const stateFrequency = "let __MP_BACK_FREQUENCY__ = 1;";
  const statePageContainerVar = `
    const { __MP_BACK_SHOW_PAGE_CONTAINER__, __MP_WEIXIN_ACTIVEBACK__, __MP_WEIXIN_INACTIVEBACK__ } = useMpWeixinBack(${pageInfo.backConfig.initialValue})
  `;
  const configBack = (() => {
    const onPageBack = pageInfo.backConfig.onPageBack;
    if (!onPageBack)
      return "";
    if (typeof onPageBack !== "function") {
      throw new Error("`onPageBack` must be a function");
    }
    const params = JSON.stringify({ page: context.getPageById(id) });
    if (isArrowFunction(onPageBack) || onPageBack.toString().includes("function")) {
      return `(${onPageBack})(${params});`;
    }
    return `(function ${onPageBack})()`;
  })();
  const stateBeforeLeave = `
    const onBeforeLeave = () => {
      if (!__MP_BACK_SHOW_PAGE_CONTAINER__.value) {
        return
      }
      if (__MP_BACK_FREQUENCY__ < ${pageInfo.backConfig.frequency}) {
        __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
        setTimeout(() => __MP_BACK_SHOW_PAGE_CONTAINER__.value = true, 0);
        __MP_BACK_FREQUENCY__++
      }
      ${configBack}
      ${callbackCode}
    };
  `;
  const { template, scriptSetup } = sfc;
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content
  };
  const templateMagicString = new MagicString(tempOffsets.content);
  templateMagicString.append(pageContainerComp);
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString());
  const scriptOffsets = {
    start: scriptSetup.loc.start.offset,
    end: scriptSetup.loc.end.offset,
    content: scriptSetup.content || ""
  };
  const scriptMagicString = new MagicString(scriptOffsets.content);
  scriptMagicString.prepend(
    ` ${importRefFromVue}
      ${importUseMpWeixinBack}
      ${stateFrequency}
      ${statePageContainerVar}
      ${stateBeforeLeave} `
  );
  activeFnCallsToModify.forEach((call) => {
    const fnCallRegex = new RegExp(`${call.name}\\(([^)]*)\\)`, "g");
    const newCall = call.original.replace(fnCallRegex, (_match, args) => {
      if (!args.trim()) {
        return `${call.name}(__MP_WEIXIN_ACTIVEBACK__)`;
      }
      return `${call.name}(__MP_WEIXIN_ACTIVEBACK__, ${args})`;
    });
    scriptMagicString.overwrite(call.start, call.end, newCall);
  });
  inActiveFnCallsToModify.forEach((call) => {
    const fnCallRegex = new RegExp(`${call.name}\\(([^)]*)\\)`, "g");
    const newCall = call.original.replace(fnCallRegex, (_match, args) => {
      if (!args.trim()) {
        return `${call.name}(__MP_WEIXIN_INACTIVEBACK__)`;
      }
      return `${call.name}(__MP_WEIXIN_INACTIVEBACK__, ${args})`;
    });
    scriptMagicString.overwrite(call.start, call.end, newCall);
  });
  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, scriptMagicString.toString());
  return codeMs.toString();
}
function optionsWalk(context, code, sfc, id) {
  const codeMs = new MagicString(code);
  const ast = babelParse(sfc.script.loc.source, sfc.script.lang);
  let pageInfo = {
    hasPageBack: false,
    pageBackFnName: "onPageBack",
    backConfig: { ...context.config }
  };
  let exportDefaultNode = null;
  let dataMethodNode = null;
  let methodsNode = null;
  let onPageBackNodeMethod = null;
  let onPageBackNodeProperty = null;
  if (ast) {
    walkAST(ast, {
      enter(node) {
        if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "ObjectExpression") {
          exportDefaultNode = node.declaration;
          const properties = node.declaration.properties;
          for (let i = 0; i < properties.length; i++) {
            const element = properties[i];
            if (element.type === "ObjectMethod" && element.key.type === "Identifier" && element.key.name === "data" && element.body.type === "BlockStatement") {
              dataMethodNode = element.body;
            }
            if (element.type === "ObjectProperty" && element.key.type === "Identifier" && element.key.name === "methods") {
              methodsNode = element.value;
            }
            const blockStatementCondition = element.type === "ObjectMethod" && element.key.type === "Identifier" && element.key.name === pageInfo.pageBackFnName && element.body.type === "BlockStatement";
            const functionExpressionCondition = element.type === "ObjectProperty" && element.key.type === "Identifier" && element.key.name === pageInfo.pageBackFnName && element.value.type === "FunctionExpression";
            if (blockStatementCondition) {
              pageInfo.hasPageBack = true;
              onPageBackNodeMethod = element;
            }
            if (functionExpressionCondition) {
              pageInfo.hasPageBack = true;
              onPageBackNodeProperty = element;
            }
          }
        }
      }
    });
  }
  if (!pageInfo.hasPageBack)
    return;
  const newDataProperty = [
    {
      type: "ObjectProperty",
      key: { type: "Identifier", name: "__MP_BACK_SHOW_PAGE_CONTAINER__" },
      value: { type: "BooleanLiteral", value: true },
      computed: false,
      shorthand: false
    },
    {
      type: "ObjectProperty",
      key: { type: "Identifier", name: "__MP_BACK_FREQUENCY__" },
      value: { type: "NumericLiteral", value: 1 },
      computed: false,
      shorthand: false
    }
  ];
  if (dataMethodNode) {
    const returnStatement = dataMethodNode.body.find(
      (node) => node.type === "ReturnStatement"
    );
    if (returnStatement && returnStatement.argument && returnStatement.argument.type === "ObjectExpression") {
      returnStatement.argument.properties.push(...newDataProperty);
    }
  } else if (exportDefaultNode) {
    const addData = {
      type: "ObjectMethod",
      key: { type: "Identifier", name: "data" },
      kind: "method",
      params: [],
      async: false,
      generator: false,
      computed: false,
      body: {
        type: "BlockStatement",
        directives: [],
        body: [
          {
            type: "ReturnStatement",
            argument: {
              type: "ObjectExpression",
              properties: newDataProperty
            }
          }
        ]
      }
    };
    exportDefaultNode.properties.push(addData);
  }
  const configBack = (() => {
    const onPageBack = pageInfo.backConfig.onPageBack;
    if (!onPageBack)
      return "";
    if (typeof onPageBack !== "function") {
      throw new Error("`onPageBack` must be a function");
    }
    const params = JSON.stringify({ page: context.getPageById(id) });
    if (isArrowFunction(onPageBack) || onPageBack.toString().includes("function")) {
      return `(${onPageBack})(${params});`;
    }
    return `(function ${onPageBack})()`;
  })();
  const stateBeforeLeave = `
    function onBeforeLeave() {
      if (this.__MP_BACK_FREQUENCY__ < ${pageInfo.backConfig.frequency}) {
        this.__MP_BACK_SHOW_PAGE_CONTAINER__ = false
        setTimeout(() => { this.__MP_BACK_SHOW_PAGE_CONTAINER__ = true }, 0);
        this.__MP_BACK_FREQUENCY__++
      }
      ${configBack}
      ${!pageInfo.backConfig.preventDefault ? "uni.navigateBack({ delta: 1 });" : ""}
    };
  `;
  const stateBeforeLeaveAst = babelParse(stateBeforeLeave);
  const stateBeforeLeaveNode = stateBeforeLeaveAst.body.find(
    (node) => node.type === "FunctionDeclaration"
  );
  const newMethodsProperty = {
    type: "ObjectMethod",
    key: {
      type: "Identifier",
      name: "onBeforeLeave"
    },
    kind: "method",
    generator: false,
    async: false,
    params: [],
    computed: false,
    body: {
      type: "BlockStatement",
      directives: [],
      body: [
        ...onPageBackNodeMethod ? onPageBackNodeMethod.body.body : [],
        ...onPageBackNodeProperty ? onPageBackNodeProperty.value.body.body : [],
        ...stateBeforeLeaveNode.body.body
      ]
    }
  };
  if (methodsNode) {
    methodsNode.properties.push(newMethodsProperty);
  } else if (exportDefaultNode) {
    const addMethods = {
      type: "ObjectProperty",
      computed: false,
      shorthand: false,
      key: {
        type: "Identifier",
        name: "methods"
      },
      value: {
        type: "ObjectExpression",
        properties: [newMethodsProperty]
      }
    };
    exportDefaultNode.properties.push(addMethods);
  }
  const { template, script } = sfc;
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content
  };
  const templateMagicString = new MagicString(tempOffsets.content);
  templateMagicString.append(pageContainerComp);
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString());
  const scriptOffsets = {
    start: script.loc.start.offset,
    end: script.loc.end.offset
  };
  const newScriptContent = (generate.default ? generate.default : generate)(ast).code;
  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, newScriptContent);
  return codeMs.toString();
}
const vueWalker = {
  compositionWalk,
  optionsWalk
};

async function transformVueFile(code, id) {
  try {
    const sfc = parse(code).descriptor;
    const { template, script, scriptSetup } = sfc;
    if (!template?.content) {
      return code;
    }
    if (!script?.content && !scriptSetup?.content) {
      return code;
    }
    const walker = scriptSetup ? "compositionWalk" : "optionsWalk";
    return vueWalker[walker](this, code, sfc, id);
  } catch (error) {
    this.log.error("\u89E3\u6790vue\u6587\u4EF6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u662F\u5426\u6B63\u786E");
    this.log.debugLog(String(error));
    return code;
  }
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class pageContext {
  constructor(config) {
    __publicField(this, "logPreText", "[mp-weixin-back] : ");
    __publicField(this, "config");
    __publicField(this, "pages", []);
    __publicField(this, "log", {
      info: (text) => {
        console.log(white(this.logPreText + text));
      },
      error: (text) => {
        console.log(red(this.logPreText + text));
      },
      debugLog: (text) => {
        if (this.config.mode === "development" && this.config.debug) {
          console.log(green(this.logPreText + text));
        }
      }
    });
    this.config = config;
  }
  getPagesJsonPath() {
    const pagesJsonPath = path.join(this.config.root, "src/pages.json");
    return pagesJsonPath;
  }
  // 获取页面配置详情
  async getPagesJsonInfo() {
    const hasPagesJson = fs.existsSync(this.getPagesJsonPath());
    if (!hasPagesJson)
      return;
    try {
      const content = await fs.promises.readFile(this.getPagesJsonPath(), "utf-8");
      const pagesContent = JSON5.parse(content);
      const { pages, subpackages } = pagesContent;
      if (pages) {
        const mainPages = pages.reduce((acc, current) => {
          acc.push(current.path);
          return acc;
        }, []);
        this.pages.push(...mainPages);
      }
      if (subpackages) {
        for (let i = 0; i < subpackages.length; i++) {
          const element = subpackages[i];
          const root = element.root;
          const subPages = element.pages.reduce((acc, current) => {
            acc.push(`${root}/${current.path}`.replace("//", "/"));
            return acc;
          }, []);
          this.pages.push(...subPages);
        }
      }
    } catch (error) {
      this.log.error("\u8BFB\u53D6pages.json\u6587\u4EF6\u5931\u8D25");
      this.log.debugLog(String(error));
    }
  }
  // 获取指定id的page
  getPageById(id) {
    const path2 = (id.split("src/")[1] || "").replace(".vue", "");
    return this.pages.find((i) => i === path2) || null;
  }
  async transform(code, id) {
    const result = await transformVueFile.call(this, code, id);
    return result;
  }
}

function MpBackPlugin(userOptions = {}) {
  let context;
  const defaultOptions = {
    initialValue: true,
    preventDefault: false,
    frequency: 1,
    debug: false
  };
  const options = { ...defaultOptions, ...userOptions };
  return {
    name: "vite-plugin-mp-weixin-back",
    enforce: "pre",
    configResolved(config) {
      context = new pageContext({ ...options, mode: config.mode, root: config.root });
    },
    buildStart() {
      context.getPagesJsonInfo();
    },
    resolveId(id) {
      if (id === virtualFileId) {
        return virtualFileId;
      }
    },
    load(id) {
      if (id.includes("node_modules")) {
        return;
      }
      if (id === virtualFileId) {
        return `
          import { ref } from 'vue'
          export default function onPageBack() {}
          export function activeMpBack(fn = null) {
            fn?.()
          }
          export function inactiveMpBack(fn = null) {
            fn?.()
          }
          export function useMpWeixinBack(initialValue = true) {
            const __MP_BACK_SHOW_PAGE_CONTAINER__ = ref(initialValue)

            const __MP_WEIXIN_ACTIVEBACK__ = () => {
              __MP_BACK_SHOW_PAGE_CONTAINER__.value = true
            }

            const __MP_WEIXIN_INACTIVEBACK__ = () => {
              __MP_BACK_SHOW_PAGE_CONTAINER__.value = false
            }

            return {
              __MP_BACK_SHOW_PAGE_CONTAINER__,
              __MP_WEIXIN_ACTIVEBACK__,
              __MP_WEIXIN_INACTIVEBACK__
            }
          }
        `;
      }
    },
    async transform(code, id) {
      if (id.includes("node_modules") || !id.includes(".vue")) {
        return;
      }
      return {
        code: await context.transform(code, id),
        map: null
      };
    }
  };
}

export { MpBackPlugin as default };
