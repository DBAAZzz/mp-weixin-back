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

## ❓ 常见问题

### Q1: 如何实现多页面独立配置？

每个页面单独调用 `onPageBack` 时传入不同的配置参数即可实现页面级定制。

### Q2: 全局配置与页面配置的优先级？

页面级配置会覆盖全局配置，建议将通用配置放在全局，特殊需求在页面单独设置。

### Q3: 不生效怎么排查？

1. 确认 `src/pages.json` 或根目录 `pages.json` 存在且格式正确
2. 确认是 `pages.json` 中注册的页面级 `.vue` 文件（组件中使用不会注入，dev 下运行时会有 console 警告）
3. 多端项目确认构建平台为 `mp-weixin`（其他平台插件自动禁用）
4. 开启 `debug: true` 查看插件日志
5. 确认 `@vue/compiler-sfc` 已安装：`pnpm add -D @vue/compiler-sfc`
