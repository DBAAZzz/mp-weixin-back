<template>
  <view class="content">
    <text class="title">mp-weixin-back 真机验证</text>
    <text class="hint">本页走 vite 全局配置（不传第二参）：frequency 默认 1，preventDefault 默认 false。</text>
    <text class="hint">点下面的按钮跳到第二页，然后在第二页**手势返回**，观察控制台。</text>

    <button @click="goForm">去第二页</button>

    <view class="log">
      <text v-for="(line, i) in logs" :key="i" class="line">{{ line }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import onPageBack from 'mp-weixin-back-helper'

const logs = ref<string[]>([])

// 不传第二个参数 → 走 vite 全局配置。
//
// ⚠️ 页面级回调是**无参**的（插件调用的是 `__MP_BACK_CB__()`）。
// 想拿页面路径，请用全局钩子（shared-options.ts 里那个，它才会收到 { page }）。
// 写成 `({ page }) => ...` 会在 vue-tsc 下报 TS2345。
onPageBack(() => {
  logs.value.push('[index] 返回拦到了')
  console.log('[example/uni] index onPageBack 触发')
})

function goForm() {
  uni.navigateTo({ url: '/pages/form/index' })
}
</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  padding: 40rpx;
}
.title {
  font-size: 36rpx;
  font-weight: bold;
  margin-bottom: 24rpx;
}
.hint {
  font-size: 26rpx;
  color: #8f8f94;
  margin-bottom: 12rpx;
}
button {
  margin: 32rpx 0;
}
.log {
  margin-top: 24rpx;
}
.line {
  display: block;
  font-size: 24rpx;
  color: #07c160;
  margin-bottom: 8rpx;
}
</style>
