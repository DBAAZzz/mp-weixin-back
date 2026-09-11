# mp-weixin-back example / uni

uni-app + Vue3 + TS 工程，用来在**微信小程序里验证真实的返回拦截效果**。

> 这是四层验证里的**第 ③ 层（运行时）**，也是唯一能验证真实语义的一层。
> `example/web` 只能验证转换产物；`page-container` 的 `beforeleave` 到底会不会触发、
> `preventDefault` / `frequency` 在真机上的行为，只能在这里看。

## 跑起来

```bash
# 1. 先在仓库根目录装依赖（插件源码的运行时依赖从这里解析）
cd ../..
pnpm install

# 2. 本工程不进 pnpm workspace，需单独装一次
cd example/uni
pnpm install

# 3. 类型检查（会抓到 build 抓不到的错，见「踩过的坑」第 5 条）
pnpm type-check

# 4. （可选）只验证产物、不开模拟器：构建 mp-weixin
pnpm build        # = uni build -p mp-weixin，产物在 dist/build/mp-weixin
```

等价地，在仓库根目录跑 `pnpm example:uni:typecheck` / `pnpm example:uni:build`。

真机验证：

1. `pnpm build`（或 `pnpm dev` 起 watch）
2. 打开**微信开发者工具** → 导入项目 → 目录选 `dist/build/mp-weixin`
3. 打开「详情 → 本地设置」勾上 **不校验合法域名**（本项目无网络请求，一般不影响）
4. 按下面的验证清单逐条试

> ⚠️ 本工程 `package.json` 里 `type: "module"` 是**必须的**，不是随手加的 —— 见下方「踩过的坑」。

## 验证清单

| 步骤 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 启动后停在首页，**手势右滑返回**（或点导航栏返回） | 首页是**最后一页**，返回会尝试退出小程序；`onPageBack` 触发，console 打印 `[example/uni] index onPageBack 触发, page = pages/index/index`。因为全局 `preventDefault: false`，不拦截，正常退出 |
| 2 | 重新进入，点「去第二页」 | 跳到 `pages/form/index` |
| 3 | 在 form 页**手势右滑返回** | **停在原地不返回**（页面级 `preventDefault: true`）。console 打印 `[form] 第 1 次拦截, page = pages/form/index` |
| 4 | 在 form 页连续手势返回 **3 次以上** | 前 3 次都被拦（日志递增到第 3 次），第 4 次放行返回首页 —— 这是 `frequency: 3` 生效 |
| 5 | 在 form 页点「点这里返回」按钮 | 同样被拦（走的是 `uni.navigateBack`，也会被 `beforeleave` 捕获） |

判据是**「拦住了没有」**（页面停不停留）＋ console 日志，不要只看日志 —— 日志只能证明回调被调，
证明不了放行行为对不对。

## 产物侧对照（第 ② 层的补充）

构建后可以直接在产物里确认注入是正确的，不需要开模拟器：

```bash
# page-container 与 bindbeforeleave 是否注入
grep -o "page-container\|beforeleave" dist/build/mp-weixin/pages/*/index.wxml

# 页面级配置是否被静态提取
#   index 页（全局配置）→ 有 navigateBack，即放行
#   form  页（preventDefault: true）→ beforeleave 处理函数内**没有** navigateBack
grep -o "navigateBack\|useMpWeixinBack" dist/build/mp-weixin/pages/*/index.js
```

> ⚠️ 别用 `grep -o "__MP_BACK_ON_BEFORE_LEAVE__"` 之类去找注入标记：**构建产物是压缩过的**，
> 这些标识符会被重命名成 `t` / `l` 之类。要看的是上面那两类**行为性**证据。
> 压缩后 `uni.navigateBack` 会变成 `e.index.navigateBack`（uni 的 uni API 别名），
> 所以 grep `uni.navigateBack` 也会漏。

注意这里和 `example/web` 的 `pages.json` 是**两份不同的文件**：本工程是真实的
uni-app 配置（`src/pages.json`，2 个页面），`example/web` 那份是给插件门控用的假配置
（8 个页面）。两份都只要改自己的即可。

## 与 example/web 的分工

```
example/
├─ shared-options.ts     两份工程共用的插件配置（debug + 全局 onPageBack）
├─ web/                  纯 Vite + Vue3：在浏览器 /__inspect 看**转换产物**
└─ uni/                  本工程：在微信开发者工具验证**真实拦截效果**
```

`example/web/test/transform.spec.ts` 有 10 个自动化用例，**但本工程没有自动化测试** ——
真实拦截语义依赖微信运行时，无法在 CI 里跑。所以本工程的验收方式是上面那张验证清单（人工）。

## 踩过的坑（改配置前先看这里）

### 1. 为什么有 `resolve-mp-back.ts` 这个文件？

uni-app 的 CLI 会**把 `vite.config.ts` 打包成 CJS**。CJS 不支持 top-level await，
而「按需加载插件源码 / dist」需要 `await import(...)`。报错长这样：

```
✘ [ERROR] Top-level await is currently not supported with the "cjs" output format
```

把 `await import` 挪进单独的文件**没用** —— esbuild 会把它一起内联进同一个 CJS bundle，
错误只是从 `vite.config.ts` 变成 `resolve-mp-back.ts`。真正的解法是
`package.json` 里的 `"type": "module"`，让整条链路走 ESM。

### 2. 设了 `type: "module"` 之后，`uni()` 报 "uni is not a function"

`@dcloudio/vite-plugin-uni` 是 CJS 包（导出 `{ default: fn, runDev, runBuild, ... }`）。
走 ESM 加载时 `import uni from ...` 拿到的不是那个函数。`vite.config.ts` 里已经
`?? uniModule` 兜了一层，两种形态都能取到。

### 3. `mp-weixin-back-helper` 这个裸导入

页面里写 `import onPageBack from 'mp-weixin-back-helper'`：

- 这个 specifier 由**插件的虚拟模块**在 `resolveId` 阶段接管，不需要真的装包
- 类型由仓库根的 `client.d.ts` 提供
- 插件 `enforce: 'pre'`，且 `buildStart` 里 `await loadPages()`，
  所以它与 `uni()` 的先后顺序**不影响**页面门控

不要给它加 `resolve.alias` 指到 `client.d.ts` —— 别名会抢在插件的 `resolveId` 之前生效，
把虚拟模块解析成一个只有类型、没有运行时代码的文件，报
`"onPageBack" is not exported by client.d.ts`。

### 4. `onPageBack` 是**默认导出**，没有具名导出

虚拟模块只导出 `export default function onPageBack()`（另有具名的 `activeMpBack` /
`inactiveMpBack` / `useMpWeixinBack`）。写 `import { onPageBack }` 会在构建期报
`"onPageBack" is not exported by "mp-weixin-back-helper"`，要写
`import onPageBack from 'mp-weixin-back-helper'`。

### 5. 页面级回调**无参**，全局钩子**才**收 `{ page }`

这是两个不同签名的回调，最容易写错：

| | 签名 | 页面路径从哪来 |
| --- | --- | --- |
| 页面级 `onPageBack(cb)` 的 `cb` | `() => void` | **拿不到**（插件调用的是 `__MP_BACK_CB__()`） |
| 全局 `vite.config` 的 `onPageBack: (params) => ...` | `(params: BackParams) => void` | `params.page`（`string \| null`） |

写成 `onPageBack(({ page }) => ...)` 时，**构建能过、真机跑起来 `page` 是 `undefined`** ——
因为压缩后看不出问题。只有 `pnpm type-check` 会报：

```
error TS2345: Argument of type '({ page }: { page: any; }) => void' is not assignable to parameter of type '() => void'.
```

**所以本工程一定要跑 `pnpm type-check`**，别只依赖 `pnpm build` 成功。

### 6. 本工程为什么自带一个 `client.d.ts`

`import onPageBack from 'mp-weixin-back-helper'` 的类型由插件仓库根的 `client.d.ts` 提供。
正常安装插件时用 `/// <reference types="mp-weixin-back/client" />` 即可；但本工程
**没把插件装进 node_modules**，那条 reference 解析不到。所以这里放了一个
`client.d.ts` 用**相对路径**指到 `../../client.d.ts`，类型只有一份、不会漂移
（已加进 `tsconfig.json` 的 `include`）。

## 用发布产物验证

默认直接加载插件源码（免构建、永远反映仓库当前改动）。想验证真正发布出去的
`dist/` + `package.json` exports：

```bash
cd ../.. && pnpm build        # 先构建插件
cd example/uni && MP_BACK_USE_DIST=1 pnpm build
```
