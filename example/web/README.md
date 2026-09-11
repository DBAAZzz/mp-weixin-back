# mp-weixin-back example / web

本地验证插件**转换产物**的最小 Vite + Vue3 工程。

> ⚠️ **web 端只能验证 transform 产物，不能验证真实拦截效果。**
> `page-container` 与 `uni.navigateBack` 是微信小程序运行时专有 API，浏览器里没有。
> 真实的「手势返回被拦住 / 回调被调用 / frequency 生效」必须回微信小程序验证 ——
> 那个用隔壁的 [`../uni`](../uni/README.md)（uni-app + 微信开发者工具）。

## 跑起来

```bash
# 1. 先在仓库根目录装依赖
#    本工程直接 import ../../src/index 使用插件源码，插件自己的运行时依赖
#    （@babel/parser / magic-string / @vue/compiler-sfc 等）是从根目录
#    node_modules 解析到的，所以这一步不能省
cd ../..
pnpm install

# 2. 本工程是独立的（不在 pnpm workspace 里），需单独装一次
cd example/web
pnpm install

# 3. 启动
pnpm dev
```

等价地，在仓库根目录跑 `pnpm example:web`。

然后打开 **<http://localhost:5173/__inspect>**，在左侧找到目标页面模块，看
**Transformed** 视图（顶部的 Mapped 可以看 sourcemap 是否逐行精确）。

想验证**真正发布出去的产物**（`dist/` + `package.json` exports）时：

```bash
cd ../.. && pnpm build          # 先构建 dist
cd example/web && MP_BACK_USE_DIST=1 pnpm dev
```

> ℹ️ 本工程与 `../uni` 共用 `../shared-options.ts` 里的插件配置，
> 避免两边漂移成不同的 `onPageBack` 行为。

## demo 页面矩阵

左侧列表按顺序对应插件的各条分支。切换页面后刷新 `/__inspect` 即可。

| 页面 | 源码写法 | 演示的分支 | 在 inspect 里的预期 |
| --- | --- | --- | --- |
| `pages/index/index` | `onPageBack(cb)` | 走 vite 全局配置 | 注入 `page-container`、`useMpWeixinBack(true)`、`__MP_BACK_FREQUENCY__ < 1`、`uni.navigateBack`、序列化的全局 hook（实参 `{"page":"pages/index/index"}`） |
| `pages/form/form` | `onPageBack(cb, { preventDefault: true, frequency: 3 })` | per-page 字面量覆盖全局 | `__MP_BACK_FREQUENCY__ < 3`；**无** `uni.navigateBack` |
| `pages/manual/manual` | `{ initialValue: false }` + `activeMpBack()` / `inactiveMpBack()` | AST 精确偏移插入实参 | `useMpWeixinBack(false)`；调用被改写为 `activeMpBack(__MP_WEIXIN_ACTIVEBACK__)` |
| `pages/options-shorthand/index` | options API `onPageBack() {}` | options 路径注入 | `data()` 返回对象里原位多出 `__MP_BACK_SHOW_PAGE_CONTAINER__`（用户的 `msg` 保留）；`methods` 里注入 `__MP_BACK_ON_BEFORE_LEAVE__()` |
| `pages/options-object/index` | options API `onPageBack: { handler, preventDefault: true, frequency: 2 }` | 对象写法 + per-page 配置 | `this.__MP_BACK_FREQUENCY__ < 2`；**无** `uni.navigateBack` |
| `pages/existing/index` | 模板里已手写 `<page-container>` | 已有 page-container → 跳过 | 产物与源码**完全一致**（inspect 无差异） |
| `pages/plain/index` | 不 import helper | 无 helper 注册调用 → 跳过（不打日志） | 产物不变，且终端 debug 日志**没有**该页记录 |
| `pages/unregistered/index` | 用了 helper，但不在 `pages.json` | 页面门控跳过 | 产物不变（import 与注册调用原样保留为死代码）；终端 debug 日志出现「不是 pages.json 中注册的页面，跳过注入」。**console 不会有任何警告** |
| `pages-sub/detail/index` | 分包页面 | 分包路径解析 | 正常注入，全局 hook 实参为 `{"page":"pages-sub/detail/index"}` |

## 跑测试（这张表有机器保障）

上表不是散文 —— `test/transform.spec.ts` 逐条断言了它：

```bash
pnpm test        # = vitest run，10 个用例
```

（等价地，在仓库根目录跑 `pnpm example:web:test`。注意**不要**在根目录直接跑
`pnpm test:run` 来跑 example —— 根的 vitest 已显式 `exclude: ['example/**']`，
因为 example 不进 workspace、自带 vite 版本，必须用它自己的配置跑。）

这个 spec **不复用 `vite.config.ts`，而是用 Vite 的编程式 API 另起一个 dev server**
（`createServer` + `configFile: false` + 内联插件）。原因：spec 要断言的正是
「插件在真实 Vite 管线里的行为」，所以它必须真的走一遍 `transformRequest`，
而不是直接调插件函数（那是仓库根 `test/*.spec.ts` 的做法，那里自带桩代码）。
`root` 指向 example 自身，于是 **真实的 `src/pages.json` 页面门控**也一并被测到。

两处刻意的取舍：

- **不加载 `vite-plugin-inspect`**：它是给人看的 dev UI，测试里没用；且它的
  `configureServer` 在 `middlewareMode` 下会抛错。
- **不复用 `shared-options.ts` 的 `USER_OPTIONS`**：那份开了 `debug: true`，
  而插件的 debug 是**直接 `console.log`**（`src/context.ts`），不经过 vite 的
  logger —— 既静音不掉也没人看。spec 里传等价但不打印的配置，唯一差别是
  `debug`；页面门控、钩子注入等被测行为完全一致。

> ⚠️ 写断言时**不要**用 `code.includes('uni.navigateBack')`。demo 页面的说明文字
> 里就写着 `uni.navigateBack` 字样，会被原样编译进产物 —— 全文包含式断言恒为真。
> spec 里用 `beforeleaveBody()` 按**花括号配对**切出 `@beforeleave` 处理函数体再判，
> 这是唯一可靠的判据（两条注入路径形态不同：composition 是顶层赋值 `…\n};`，
> options 是 method 简写 `…\n  },`，靠固定字符串找结尾会切过头）。

> ℹ️ 仓库根的 `pnpm typecheck` **不含** example（根 `tsconfig.json` 的
> `exclude` 里有 `example`，否则 example 的 `vite.config.ts` / `main.ts`
> 在根配置下必然报错、把 CI 打挂）。想单独检查 example 的类型，用上面那条
> `npx tsc --noEmit …` 命令。


## 终端日志（第一层验证）

`web/vite.config.ts` 里开了 `debug: true`，dev 启动时终端会出现：

```
[mp-weixin-back] : 已加载 8 个页面（<root>/src/pages.json）      ← 绿色，仅 dev + debug
[mp-weixin-back] : <...>/unregistered/index.vue 不是 pages.json 中注册的页面，跳过注入
```

> ⚠️ **跳过日志是按需出现的。** Vite 是请求驱动的：一个页面只有被浏览器实际加载过、
> 进入了模块图，插件才会处理它、才可能打日志。启动瞬间只会看到「已加载 N 个页面」这一条。
> 想在终端看到 `existing` 页的「已有 page-container 组件，跳过注入」，
> 需要先在页面上**点开那一页**（或在 `/__inspect` 里请求它）。
> 反过来，**日志缺失不等于没生效** —— 判据是「点开之后应出现对应记录」。

`plain/index.vue` 无论怎么加载都**不会**出现任何记录——它虽然通过了插件入口那道基于字符串的
快速跳过门（模板说明文字里恰好含 `onPageBack` 字样），但因为没有来自 helper 的注册调用，
在后续检查处直接返回，该分支不打日志。`unregistered` 则不同，它有注册调用、是走到页面门控
才被挡下的，所以会留下那行日志——**这正是区分两者的唯一线索**。

### 试一下构建期报错

插件把「用户配置错误」和「意外异常」分开处理：前者终止构建（dev 下显示 Vite
overlay），后者只警告并跳过该文件。可以改 `form.vue` 观察：

```js
// 把内联对象字面量换成变量 → 构建期报错（配置需静态读取）
const opts = { preventDefault: true }
onPageBack(cb, opts)          // ❌ 报错：第二个参数必须是内联对象字面量

// frequency 传字符串 → 构建期报错（按字段校验字面量类型）
onPageBack(cb, { frequency: '3' })   // ❌ 报错：frequency 必须是数字字面量
```

## 仓库里各层验证

| 层次 | 手段 | 覆盖对象 |
| --- | --- | --- |
| 构建期日志 | 上面说的 `debug: true` | 人眼确认页面是否被处理 |
| 转换产物（手看） | 本工程 `/__inspect`；小程序侧 `pnpm build:mp-weixin` 后 grep 产物的 wxml/js | 人眼确认注入形态 |
| 转换产物（机器） | **本工程 `pnpm test`**（10 个用例，真实 Vite 管线 + 真实 `pages.json` 门控） | 上表那张矩阵 |
| 插件单元 | 仓库根目录 `pnpm test:run`（40 个用例，直接调插件函数、自带桩代码） | 插件的各分支实现 |
| 运行时 | 小程序里手势返回 / 点导航栏返回，看回调是否触发。注意页面被跳过时 console 通常是安静的——判断是否被处理请以终端 debug 日志为准 | 真实拦截语义（**web 端无法覆盖**） |

> 两套测试是**互补**的，不是重复：根目录那 40 个用例证明插件函数本身正确，
> 但证不了「插件被正确挂进 Vite 管线、且 example 这份 pages.json 门控按预期放行/拦截」；
> example 这 10 个用例证明后者。改动插件后两边都要绿。
