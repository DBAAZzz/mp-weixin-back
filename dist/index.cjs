'use strict';

const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');
const kolorist = require('kolorist');
const generate = require('@babel/generator');
const compilerSfc = require('@vue/compiler-sfc');
const astKit = require('ast-kit');
const MagicString = require('magic-string');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const path__default = /*#__PURE__*/_interopDefaultCompat(path);
const fs__default = /*#__PURE__*/_interopDefaultCompat(fs);
const JSON5__default = /*#__PURE__*/_interopDefaultCompat(JSON5);
const generate__default = /*#__PURE__*/_interopDefaultCompat(generate);
const MagicString__default = /*#__PURE__*/_interopDefaultCompat(MagicString);

const virtualFileId = "mp-weixin-back-helper";

function isArrowFunction(func) {
  if (typeof func !== "function")
    return false;
  return !func.hasOwnProperty("prototype") && func.toString().includes("=>");
}
async function parseSFC(code) {
  try {
    return compilerSfc.parse(code).descriptor;
  } catch (error) {
    throw new Error(`\u89E3\u6790vue\u6587\u4EF6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u662F\u5426\u6B63\u786E`);
  }
}
async function transformVueFile(code, id) {
  const sfc = await parseSFC(code);
  if (!sfc.template?.content) {
    return code;
  }
  const componentStr = '  <page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>\n';
  let pageBackConfig = { ...this.config };
  let hasPageBack = false;
  let hasImportRef = false;
  let pageBackFnName = "onPageBack";
  let callbackCode = ``;
  const codeMs = new MagicString__default(code);
  const setupCode = sfc.scriptSetup?.loc.source || "";
  const setupAst = astKit.babelParse(setupCode, sfc.scriptSetup?.lang);
  if (setupAst) {
    astKit.walkAST(setupAst, {
      enter(node) {
        if (node.type === "ImportDeclaration") {
          if (node.source.value.includes(virtualFileId)) {
            const importSpecifier = node.specifiers[0];
            hasPageBack = true;
            pageBackFnName = importSpecifier.local.name;
          }
          if (node.source.value === "vue") {
            node.specifiers.some((specifier) => {
              if (specifier.local.name === "ref") {
                hasImportRef = true;
                return true;
              }
              return false;
            });
          }
        }
        if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.loc?.identifierName === pageBackFnName) {
          const callback = node.expression.arguments[0];
          const backArguments = node.expression.arguments[1];
          if (backArguments?.type === "ObjectExpression") {
            const config = new Function(
              // @ts-ignore
              `return (${(generate__default.default ? generate__default.default : generate__default)(backArguments).code});`
            )();
            Object.assign(pageBackConfig, config);
          }
          if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
            const body = callback.body;
            if (body.type === "BlockStatement") {
              callbackCode += body.body.map(
                // @ts-ignore
                (statement) => (generate__default.default ? generate__default.default : generate__default)(statement).code
              ).join("");
            }
          }
        }
      }
    });
  }
  if (!hasPageBack)
    return;
  this.log.devLog(`\u9875\u9762${this.getPageById(id)}\u6CE8\u5165mp-weixin-back`);
  if (code.includes("<page-container")) {
    this.log.devLog(`${this.getPageById(id)}\u9875\u9762\u5DF2\u6709page-container\u7EC4\u4EF6\uFF0C\u6CE8\u5165\u5931\u8D25`);
    return code;
  }
  if (!pageBackConfig.preventDefault) {
    callbackCode += `uni.navigateBack({ delta: 1 });`;
  }
  const configBack = (() => {
    const onPageBack = pageBackConfig.onPageBack;
    if (!onPageBack)
      return "";
    if (typeof onPageBack !== "function") {
      throw new Error("`onPageBack` must be a function");
    }
    const params = JSON.stringify({ page: this.getPageById(id) });
    if (isArrowFunction(onPageBack) || onPageBack.toString().includes("function")) {
      return `(${onPageBack})(${params});`;
    }
    return `(function ${onPageBack})()`;
  })();
  const beforeLeaveStr = `
    ${!hasImportRef ? "import { ref } from 'vue'" : ""}
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
  `;
  const { template, script, scriptSetup } = sfc;
  const tempOffsets = {
    start: template.loc.start.offset,
    end: template.loc.end.offset,
    content: template.content
  };
  const templateMagicString = new MagicString__default(tempOffsets.content);
  templateMagicString.append(componentStr);
  codeMs.overwrite(tempOffsets.start, tempOffsets.end, templateMagicString.toString());
  const scriptSfc = script || scriptSetup;
  if (!scriptSfc)
    return;
  const scriptOffsets = {
    start: scriptSfc.loc.start.offset,
    end: scriptSfc.loc.end.offset,
    content: scriptSfc.content || ""
  };
  const scriptMagicString = new MagicString__default(scriptOffsets.content);
  scriptMagicString.prepend(beforeLeaveStr);
  codeMs.overwrite(scriptOffsets.start, scriptOffsets.end, scriptMagicString.toString());
  return codeMs.toString();
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class pageContext {
  constructor(config) {
    __publicField(this, "config");
    __publicField(this, "pages", []);
    __publicField(this, "log", {
      info: (text) => {
        console.log(kolorist.white(text));
      },
      error: (text) => {
        console.log(kolorist.red(text));
      },
      devLog: (text) => {
        if (this.config.mode === "development" && this.config.debug) {
          console.log(kolorist.green(text));
        }
      }
    });
    this.config = config;
  }
  getPagesJsonPath() {
    const pagesJsonPath = path__default.join(this.config.root, "src/pages.json");
    return pagesJsonPath;
  }
  // 获取页面配置详情
  async getPagesJsonInfo() {
    const hasPagesJson = fs__default.existsSync(this.getPagesJsonPath());
    if (!hasPagesJson)
      return;
    try {
      const content = await fs__default.promises.readFile(this.getPagesJsonPath(), "utf-8");
      const pagesContent = JSON5__default.parse(content);
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
      this.log.devLog(String(error));
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
        return `export default function onPageBack() {}`;
      }
    },
    async transform(code, id) {
      if (id.includes("node_modules") || !id.includes(".vue")) {
        return;
      }
      return context.transform(code, id);
    }
  };
}

module.exports = MpBackPlugin;
