# mp-weixin-back

Vite plugin to intercept back navigation (gesture back + navbar back button) in WeChat miniprogram (mp-weixin) built with uni-app + Vue 3.

## TL;DR

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import mpBackPlugin from 'mp-weixin-back'

export default defineConfig({
  plugins: [mpBackPlugin()],
})
```

```ts
// Any page .vue file — inside <script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  // handle back: show dialog, log analytics, etc.
})
```

---

## 功能概述

`mp-weixin-back` 是一个专门用于监听微信小程序`手势返回`、`导航栏返回事件`、`navigateBack`的工具库，提供灵活的配置选项和简洁的 API。

## 📦 安装

```bash
npm install mp-weixin-back
# 或
pnpm add mp-weixin-back
```

## ⚙️ Vite 配置

在 `vite.config.ts` 中添加插件：

```ts
import { defineConfig } from 'vite'
import mpBackPlugin from 'mp-weixin-back'

export default defineConfig({
  plugins: [
    mpBackPlugin({
      // 可选配置项
      preventDefault: false, // 是否阻止默认返回行为，设置成 true 则不会返回上一层
      frequency: 1, // 阻止次数，需要一直拦截则设置一个很大的值即可，如：9999
      debug: false, // 调试模式，默认为 false
      onPageBack: ({ page }) => {
        console.log('返回事件触发，当前页面：', page)
      }, // 全局钩子，任意页面触发时执行。⚠️ 该函数会被序列化注入页面，必须自包含（不能引用 vite.config.ts 中的变量或 import 的模块）
      pageContainer: {
        zIndex: 1, // 注入的 page-container 的 z-index，默认 1
        overlay: false, // 是否显示遮罩，默认 false
        duration: false, // 动画时长（ms），默认 false 关闭
      },
    }),
  ],
})
```

> 插件会自动探测 `src/pages.json`（CLI 项目）或根目录 `pages.json`（HBuilderX 项目）；多端构建时仅在 `UNI_PLATFORM=mp-weixin` 下生效，其他平台自动降级为 no-op。

## 🚀 快速开始

### 基本使用

```ts
<script setup>
import onPageBack from 'mp-weixin-back-helper'

// 简单监听返回事件
onPageBack(() => {
  console.log('检测到返回操作（手势或导航栏返回）')
  // 在这里添加你的处理逻辑
})
</script>
```

### 高级配置

```ts
// 带配置的监听
onPageBack(
  () => {
    console.log('返回事件被触发')
    // 自定义处理逻辑
  },
  {
    initialValue: false, // 立即生效，默认值为`true`
    preventDefault: true, // 阻止默认返回行为
    frequency: 2, // 阻止次数为2次
  }
)
```

### 显示确认弹窗（常见场景）

```ts
<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(
  () => {
    uni.showModal({
      title: '提示',
      content: '确定要离开当前页面吗？',
      success: (res) => {
        if (res.confirm) uni.navigateBack()
      },
    })
  },
  { preventDefault: true }
)
</script>
```

## 📚 API 文档

### `onPageBack(callback, options?)`

监听页面返回事件，必须在 `<script setup>` 顶层调用。

| 参数       | 类型                | 必填 | 说明                     |
| ---------- | ------------------- | ---- | ------------------------ |
| `callback` | `() => void`        | 是   | 返回事件触发时的回调函数 |
| `options`  | `OnPageBackOptions` | 否   | 监听器配置选项           |

#### 配置选项 `OnPageBackOptions`

| 参数             | 类型      | 默认值  | 说明                                                            |
| ---------------- | --------- | ------- | --------------------------------------------------------------- |
| `preventDefault` | `boolean` | `false` | 是否阻止默认返回行为（`true` 时页面不会实际返回）               |
| `frequency`      | `number`  | `1`     | 阻止次数                                                        |
| `initialValue`   | `boolean` | `true`  | 是否立即启用监听（设为 `false` 时需手动调用 `activeMpBack()`）  |

> ⚠️ 这些配置在**构建期静态读取**，必须直接写布尔/数字字面量（如 `{ frequency: 3 }`），不能传变量或表达式。需要运行时动态控制时请使用 `activeMpBack()` / `inactiveMpBack()`。

### 辅助方法

#### `activeMpBack()`

启用返回事件监听（需在`<script setup>`中执行）

#### `inactiveMpBack()`

禁用返回事件监听（需在`<script setup>`中执行）

举例：

```html
<template>
  <div>
    <!-- 页面代码 -->
    <button @click="activeMpBack()">开启</button>
    <button @click="inactiveMpBack()">禁用</button>
  </div>
</template>

<script setup>
  import onPageBack, { activeMpBack, inactiveMpBack } from 'mp-weixin-back-helper'

  onPageBack(() => { /* 处理返回 */ }, { initialValue: false })
</script>
```

### 插件全局配置 `mpBackPlugin(options)`

| 参数             | 类型                                        | 默认值  | 说明                       |
| ---------------- | ------------------------------------------- | ------- | -------------------------- |
| `preventDefault` | `boolean`                                   | `false` | 全局阻止默认返回行为       |
| `frequency`      | `number`                                    | `1`     | 全局阻止次数               |
| `initialValue`   | `boolean`                                   | `true`  | 全局是否立即启用监听       |
| `debug`          | `boolean`                                   | `false` | 开发模式下开启调试日志     |
| `onPageBack`     | `(params: { page: string \| null }) => void` | —       | 全局回调，任意页面触发执行。必须自包含（会被序列化注入页面，闭包变量运行时不可用，检测到时构建期会警告） |
| `pageContainer`  | `{ zIndex?, overlay?, duration? }`          | 见上文  | 注入的 page-container 组件属性 |

## 🎯 选项式 API 支持

在 Vue 组件的选项对象中直接定义 `onPageBack`，支持三种写法：

```html
<script>
  export default {
    // 写法一：方法简写（使用 vite 中的全局配置）
    onPageBack() {
      console.log('检测到返回操作')
    },
  }
</script>
```

```html
<script>
  export default {
    // 写法二：函数属性
    onPageBack: function () {
      console.log('检测到返回操作')
    },
  }
</script>
```

```html
<script>
  export default {
    // 写法三：对象写法，支持页面级配置（与 composition API 对齐）
    onPageBack: {
      preventDefault: true,
      frequency: 3,
      initialValue: true,
      handler() {
        console.log('检测到返回操作')
      },
    },
  }
</script>
```

回调中的 `this` 指向组件实例，可直接访问 `data` / `methods`。

## 🛠 类型支持

### 类型声明配置

在 `tsconfig.json` 中添加：

```json
{
  "compilerOptions": {
    "types": ["mp-weixin-back/client"]
  }
}
```

或通过声明文件引用：

```typescript
// env.d.ts
/// <reference types="mp-weixin-back/client" />
```

## 🔍 如何验证插件是否生效

插件是**纯构建期转换**，所以验证分四层，从快到慢：

### ① 构建期日志（最快）

开 `debug: true` 后跑 dev，终端会打印 `pages.json` 加载结果与每个页面的**跳过原因**：

```
[mp-weixin-back] : 已加载 8 个页面（src/pages.json）
[mp-weixin-back] : src/pages/existing/index.vue 页面已有 page-container 组件，跳过注入
[mp-weixin-back] : src/pages/unregistered/index.vue 不是 pages.json 中注册的页面，跳过注入
```

没看到任何相关日志，说明该页面在解析 AST 之前就被跳过了（没 import helper、也没写 `onPageBack` 选项）——这是正常的，不代表出错。

### ② 转换产物

仓库内 `example/` 下有两个**互补**的验证工程，都默认直接加载插件源码（免构建）：

| 目录 | 形态 | 验证什么 |
| --- | --- | --- |
| [`example/web`](./example/web/README.md) | 纯 Vite + Vue3 | 用 `vite-plugin-inspect` 在浏览器里看**每个页面的转换产物** |
| [`example/uni`](./example/uni/README.md) | uni-app + Vue3 | 在**微信开发者工具**里验证**真实拦截效果**（这是第 ③ 层唯一能测的地方） |

**web 端**：

```bash
cd example/web && pnpm install && pnpm dev
# 打开 http://localhost:5173/__inspect
```

它包含 9 个 demo 页面，逐一覆盖注入与跳过分支（composition / options 三种写法 / 分包 / 全局钩子 / 已有 page-container / 未注册页面…），每个页面的「预期产物」都以表格列在 [`example/web/README.md`](./example/web/README.md)。

那张表不是散文，有机器保障：

```bash
pnpm example:web:test    # = pnpm --dir example/web test，10 个用例
```

它用 Vite 的**编程式 API** 起一个真实 dev server（`configFile: false` + 内联插件）走
`transformRequest`，因此同时覆盖「插件被正确挂进 Vite 管线」与「真实 `pages.json`
页面门控放行/拦截」——这两点是仓库根 `test/*.spec.ts` 覆盖不到的（那里直接调插件函数）。

**小程序端**：用 [`example/uni`](./example/uni/README.md) 构建后，在产物里 grep：

```bash
grep -o "page-container\|beforeleave" example/uni/dist/build/mp-weixin/pages/*/index.wxml
```

> ⚠️ 产物是**压缩过**的，`__MP_BACK_ON_BEFORE_LEAVE__` 这类标识符会被重命名，grep 不到。
> 要看行为性证据（`page-container` / `bindbeforeleave` / `navigateBack`），
> 且注意 `uni.navigateBack` 在产物里是 `e.index.navigateBack`。详见
> [`example/uni/README.md`](./example/uni/README.md) 的「产物侧对照」。

### ③ 运行时

现成的工程是 [`example/uni`](./example/uni/README.md)：uni-app + Vue3，两个 demo 页面
（一个走全局配置、一个 `preventDefault: true` + `frequency: 3`），README 里有一张
**逐条可执行的验证清单**（手势返回几次、每步预期看到什么）。

```bash
cd example/uni && pnpm install && pnpm build
# 微信开发者工具导入 example/uni/dist/build/mp-weixin
```

- 小程序里手势返回、点导航栏返回，看回调是否触发、`preventDefault` / `frequency` 是否符合预期
- 判据是**「页面有没有真的停住 / 放行」**，不要只看 console 日志 ——
  日志只能证明回调被调用，证明不了放行行为正确
- 需要留意一个容易误判的点：**页面被插件跳过时，console 通常是安静的**。虚拟模块确实内置了
  `[mp-weixin-back] … 未生效：该文件未被插件编译处理…` 警告，但它只在页面
  import 了 helper、调用未被改写、且代码被实际执行到该导出时才可能触发。
  被页面门控跳过（用了 helper 但没注册进 `pages.json`）的页面会保留原样调用，
  因而不会触发警告。**判断页面是否被处理，请以终端 debug 日志为准**（见 ①），
  不要以 console 是否有警告为准。

### ④ 自动化测试

两个套件互补，改动插件后都要跑 —— 已经合成一条命令：

```bash
pnpm test:all   # = pnpm test:run && pnpm example:web:test
```

- `pnpm test:run`（50 个用例）：直接调插件函数、自带桩代码，覆盖各分支实现
- `pnpm --dir example/web test`（10 个用例）：真实 Vite 管线 + 真实 `pages.json` 门控（见 ②）

前者证明插件函数本身正确；后者证明插件**被正确挂进 Vite 管线**、且页面门控
按预期放行/拦截——这是单测函数覆盖不到的。**两个套件都绿才算测试通过**，
`pnpm test:all` 会在任一套件失败时以非零码退出。

---

## 📦 发布流程

用 [changesets](https://github.com/changesets/changesets) 管理版本。**合并到 `main` 即发布**，
只有一步前置动作：

```bash
pnpm changeset    # 描述这次改动、选 semver 级别；把生成的 .changeset/*.md 一起提交
```

带着 changeset 的分支合并进 `main` 后，[`publish.yml`](./.github/workflows/publish.yml)
自动完成：**应用版本号**（`changeset version`，消费掉 changeset 并写 CHANGELOG）
→ 以 bot 身份提交回 `main` → 执行 `pnpm release` 发布。

`pnpm release` 的顺序是：查 npm 上该版本是否已存在（存在即跳过）→ `typecheck`
→ `test:all` → `build` → `check-publish` → `pnpm publish --access public`。
**任一步失败都不会发布**，所以 example/web 套件挂了也发不出去。

关于「没有 changeset」的情况：此时版本号不变，而当前版本已在 npm 上，
`pnpm release` 会主动跳过（`already exists on npm. Skip publish.`）。流程是绿的，
但什么都不会发生 —— 这是**预期的**，不是坏了。想发新版就得先 `pnpm changeset`。

> **`NPM_TOKEN`**（Settings → Secrets and variables → Actions，npm 的 Automation
> 类型 token）是必需的。没配的话流程会在 `Verify NPM_TOKEN` 这步直接失败并给出
> 提示，不会拖到 publish 才报一个难懂的 E401。

本地想先演练一遍：`pnpm release:dry`。

> **为什么不用 [`changesets/action`](https://github.com/changesets/action)**：它判断
> 「要发布还是开版本 PR」的依据是工作区里 `.changeset/*.md` 是否还在，而
> `changeset version` 只把这些文件的删除**暂存**（`git add`）、工作区文件依旧存在，
> 于是它会把「已版本化、该发布」误判成「还有 changeset」→ 去开一个 Version Packages
> PR。它的发布判定还依赖 stdout 里的 `New tag:`，而我们走自定义脚本（`release.mjs`）
> 不打印这行，结论恒为「未发布」。所以本流程直接 `pnpm release`，发布与否由
> `release.mjs` 的 `isPublished()` 决定。

> 流程内部会把版本提交推回 `main`。这一次 push **不会**再触发本 workflow ——
> 它用的是 `secrets.GITHUB_TOKEN`，而 GitHub 规定「由 `GITHUB_TOKEN` 触发的事件
> 不会创建新的 workflow run」。注意**不能**只依赖提交信息里的 `[skip ci]`，
> GitHub 默认不看它；若将来改用 PAT / GitHub App token，这道递归防护会失效，
> 需要另加防循环条件。

---

## ❓ 常见问题

### Q1: 如何实现多页面独立配置？

每个页面单独调用 `onPageBack` 时传入不同的配置参数即可实现页面级定制。

### Q2: 全局配置与页面配置的优先级？

页面级配置会覆盖全局配置，建议将通用配置放在全局，特殊需求在页面单独设置。

### Q3: 不生效怎么排查？

1. 确认 `src/pages.json` 或根目录 `pages.json` 存在且格式正确
2. 确认是 `pages.json` 中注册的页面级 `.vue` 文件（组件中使用不会注入，dev 下运行时会有 console 警告）
3. 多端项目确认构建平台为 `mp-weixin`（其他平台插件自动禁用）
4. 开启 `debug: true` 查看插件日志（见 [如何验证插件是否生效](#-如何验证插件是否生效)）
5. 确认 `@vue/compiler-sfc` 已安装：`pnpm add -D @vue/compiler-sfc`
