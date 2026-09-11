<template>
  <section>
    <h2>existing — 模板已有 page-container（跳过注入）</h2>
    <p>
      这一页既 import 了 helper、也调用了 <code>onPageBack</code>，但模板里已经手写了
      <code>&lt;page-container&gt;</code>。插件检测到后<b>整体跳过</b>，避免重复注入。
    </p>
    <p>
      <b>预期产物：</b>与源码完全一致——inspect 里该模块的 Transformed 视图看不出任何差异，
      终端 debug 日志出现「已有 page-container 组件，跳过注入」。
    </p>
    <page-container :show="show" @beforeleave="onBeforeLeave"></page-container>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import onPageBack from 'mp-weixin-back-helper'

const show = ref(true)

onPageBack(() => {
  console.log('[example] existing 页面回调触发')
})

function onBeforeLeave() {
  console.log('[example] existing 页面自己实现的 beforeleave')
}
</script>
