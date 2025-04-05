# mp-weixin-back

## 功能概述

`mp-weixin-back` 是一个专门用于监听微信小程序`手势返回`、`导航栏返回事件`、`navigateBack`的工具库，提供灵活的配置选项和简洁的 API。

## 📦 安装

```bash
npm install mp-weixin-back
# 或
yarn add mp-weixin-back
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
      onPageBack: () => {
        console.log('返回事件触发')
      }, // 统一钩子，事件触发时执行
    }),
  ],
})
```

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

## 📚 API 文档

### `onPageBack(callback, config?)`

监听页面返回事件

| 参数     | 类型         | 必填 | 说明                     |
| -------- | ------------ | ---- | ------------------------ |
| callback | `() => void` | 是   | 返回事件触发时的回调函数 |
| options  | Object       | 否   | 监听器配置选项           |

#### 配置选项

| 参数           | 类型    | 默认值 | 说明                                            |
| -------------- | ------- | ------ | ----------------------------------------------- |
| preventDefault | boolean | false  | 是否阻止默认返回行为（true 时页面不会实际返回） |
| frequency      | number  | 1      | 阻止次数                                        |
| initialValue   | boolean | true   | 是否立即启用监听（设为 false 时需手动激活）     |

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
    <button @click="toggleListener(true)">开启</button>
    <button @click="toggleListener(false)">禁用</button>
  </div>
</template>

<script setup>
  import onPageBack, { activeMpBack, inactiveMpBack } from 'mp-weixin-back-helper'

  const toggleListener = (enable) => {
    enable ? activeMpBack() : inactiveMpBack()
  }
</script>
```

## 🎯 选项式 API 支持（未完善）

组件内直接声明

在 Vue 组件的选项对象中直接定义 onPageBack 方法：

```html
<template>
  <div class="container">
    <div>当前页面内容</div>
  </div>
</template>

<script>
  export default {
    // 读取 vite 中的配置
    onPageBack() {
      console.log('检测到返回操作')
      // 业务逻辑处理
    },
  }
</script>
```

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
