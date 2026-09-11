<template>
  <view class="content">
    <text class="title">preventDefault + frequency</text>
    <text class="hint">本页: onPageBack(cb, { preventDefault: true, frequency: 3 })</text>
    <text class="hint">手势返回时**不会**放行，回调被调用，页面停在原地。</text>
    <text class="hint">连划 3 次以上才会放行（frequency 计数）。</text>

    <button @click="goBack">点这里返回（同样被拦）</button>

    <view class="log">
      <text v-for="(line, i) in logs" :key="i" class="line">{{ line }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import onPageBack from 'mp-weixin-back-helper'

const logs = ref<string[]>([])

// 内联对象字面量：插件在构建期静态提取这两个字段。
// 换成变量会构建期报错 —— 这是刻意的设计（配置必须可静态读取）。
//
// ⚠️ 页面级回调**无参**（插件调用 `__MP_BACK_CB__()`），不要写成 `({ page }) => ...`。
onPageBack(
  () => {
    logs.value.push(`[form] 第 ${logs.value.length + 1} 次拦截`)
    console.log('[example/uni] form onPageBack 触发')
  },
  { preventDefault: true, frequency: 3 }
)

function goBack() {
  uni.navigateBack({ delta: 1 })
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
.line {
  display: block;
  font-size: 24rpx;
  color: #07c160;
  margin-bottom: 8rpx;
}
</style>
