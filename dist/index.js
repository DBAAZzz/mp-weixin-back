var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/context.ts
import path from "path";
import fs from "fs";
import JSON5 from "json5";

// utils/index.ts
import generate from "@babel/generator";
import { parse } from "@vue/compiler-sfc";
import { babelParse, walkAST } from "ast-kit";

// utils/constant.ts
var virtualFileId = "mp-weixin-back-helper";

// utils/index.ts
function isArrowFunction(func) {
  if (typeof func !== "function") return false;
  return !func.hasOwnProperty("prototype") && func.toString().includes("=>");
}
function parseSFC(code) {
  return __async(this, null, function* () {
    try {
      return parse(code).descriptor;
    } catch (error) {
      throw new Error(`\u89E3\u6790vue\u6587\u4EF6\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u662F\u5426\u6B63\u786E`);
    }
  });
}
function transformVueFile(code, id) {
  return __async(this, null, function* () {
    var _a, _b;
    if (code.includes("<page-container")) {
      return code;
    }
    if (!code.includes("<template")) {
      return code;
    }
    const componentStr = '<page-container :show="__MP_BACK_SHOW_PAGE_CONTAINER__" :overlay="false" @beforeleave="onBeforeLeave" :z-index="1" :duration="false"></page-container>';
    const sfc = yield parseSFC(code);
    const setupCode = (_a = sfc.scriptSetup) == null ? void 0 : _a.loc.source;
    const setupAst = babelParse(setupCode || "", (_b = sfc.scriptSetup) == null ? void 0 : _b.lang);
    let pageBackConfig = this.config;
    let hasPageBack = false, hasImportRef = false, pageBackFnName = "onPageBack", callbackCode = ``;
    if (setupAst) {
      walkAST(setupAst, {
        enter(node) {
          var _a2;
          if (node.type == "ImportDeclaration" && node.source.value.includes(virtualFileId)) {
            const importSpecifier = node.specifiers[0];
            hasPageBack = true;
            pageBackFnName = importSpecifier.local.name;
          }
          if (node.type == "ImportDeclaration" && node.source.value === "vue") {
            const importSpecifiers = node.specifiers;
            for (let i = 0; i < importSpecifiers.length; i++) {
              const element = importSpecifiers[i];
              if (element.local.name == "ref") {
                hasImportRef = true;
                break;
              }
            }
          }
          if (node.type == "ExpressionStatement" && node.expression.type == "CallExpression" && ((_a2 = node.expression.callee.loc) == null ? void 0 : _a2.identifierName) == pageBackFnName) {
            const callback = node.expression.arguments[0];
            const backArguments = node.expression.arguments[1];
            if (backArguments && backArguments.type == "ObjectExpression") {
              const config = new Function(`return (${generate(backArguments).code});`)();
              pageBackConfig = __spreadValues(__spreadValues({}, pageBackConfig), config);
            }
            if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
              const body = callback.body;
              if (body.type === "BlockStatement") {
                body.body.forEach((statement) => {
                  callbackCode += generate(statement).code;
                });
              }
            }
          }
        }
      });
    }
    if (!hasPageBack) return;
    if (!pageBackConfig.preventDefault) {
      callbackCode += `uni.navigateBack({ delta: 1 });`;
    }
    const configBack = (() => {
      if (!pageBackConfig.onPageBack) return "";
      if (typeof pageBackConfig.onPageBack !== "function") {
        throw new Error("`onPageBack` must be a function");
      }
      const params = JSON.stringify({
        page: this.getPageById(id)
      });
      const hasFunction = pageBackConfig.onPageBack.toString().includes("function");
      if (isArrowFunction(pageBackConfig.onPageBack) || hasFunction) {
        return `(${pageBackConfig.onPageBack})(${params});`;
      }
      return `(function ${pageBackConfig.onPageBack})()`;
    })();
    const beforeLeaveStr = `
    ${!hasImportRef ? "import { ref } from 'vue'" : ""}
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
      // \u8FD0\u884C\u914D\u7F6E\u7684\u533F\u540D\u51FD\u6570
      ${configBack}
      ${callbackCode}
    };
  `;
    const result = code.replace(
      /(<template.*?>)([\s\S]*?)(<\/template>)([\s\S]*?)(<script\s+(?:lang="ts"\s+)?setup.*?>|$)/,
      (match, templateStart, templateContent, templateEnd, middleContent, scriptSetup) => {
        const hasScriptSetup = Boolean(scriptSetup);
        const scriptStartTag = hasScriptSetup ? scriptSetup : "<script setup>";
        const scriptEndTag = hasScriptSetup ? "" : "</script>";
        const injectedTemplate = `${templateStart}${templateContent}
 ${componentStr}
${templateEnd}`;
        const injectedScript = `
${middleContent}${scriptStartTag}
${beforeLeaveStr}
${scriptEndTag}`;
        return injectedTemplate + injectedScript;
      }
    );
    return result;
  });
}

// src/context.ts
var pageContext = class {
  constructor(config) {
    this.pages = [];
    this.config = config;
  }
  getPagesJsonPath() {
    const pagesJsonPath = path.join(this.config.root, "src/pages.json");
    return pagesJsonPath;
  }
  // 获取页面配置详情
  getPagesJsonInfo() {
    return __async(this, null, function* () {
      const hasPagesJson = fs.existsSync(this.getPagesJsonPath());
      if (!hasPagesJson) return;
      try {
        const content = yield fs.promises.readFile(this.getPagesJsonPath(), "utf-8");
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
          const root = subpackages.root;
          const subPages = subpackages.pages.reduce((acc, current) => {
            acc.push(`${root}/${current.path}`.replace("//", "/"));
            return acc;
          }, []);
          this.pages.push(...subPages);
        }
      } catch (error) {
        throw new Error("\u8BF7\u6B63\u786E\u914D\u7F6E\u9879\u76EE\u7684pages.json\u6587\u4EF6");
      }
    });
  }
  // 获取指定id的page
  getPageById(id) {
    const path2 = (id.split("src/")[1] || "").replace(".vue", "");
    return this.pages.find((i) => i === path2) || null;
  }
  transform(code, id) {
    return __async(this, null, function* () {
      const result = yield transformVueFile.call(this, code, id);
      return result;
    });
  }
};

// src/index.ts
function MpBackPlugin(userOptions = {}) {
  let context;
  const defaultOptions = {
    preventDefault: false,
    frequency: 1
  };
  const options = __spreadValues(__spreadValues({}, defaultOptions), userOptions);
  return {
    name: "vite-plugin-mp-weixin-back",
    enforce: "pre",
    configResolved(config) {
      context = new pageContext(__spreadProps(__spreadValues({}, options), { mode: config.mode, root: config.root }));
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
    transform(code, id) {
      return __async(this, null, function* () {
        if (id.includes("node_modules") || !id.includes(".vue")) {
          return;
        }
        return context.transform(code, id);
      });
    }
  };
}
var src_default = MpBackPlugin;
export {
  src_default as default
};
