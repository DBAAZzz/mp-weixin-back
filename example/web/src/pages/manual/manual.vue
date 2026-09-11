<template>
  <section>
    <h2>manual — initialValue: false + 手动开关</h2>
    <p>
      <code>onPageBack(cb, { initialValue: false })</code>
      表示挂载时不启用监听，需要时再调 <code>activeMpBack()</code>。
    </p>
    <p><b>预期产物：</b></p>
    <ul>
      <li><code>useMpWeixinBack(false)</code>（全局为 true，被页面级字面量覆盖）</li>
      <li>
        两处调用被按 AST 精确偏移插入实参：<code>activeMpBack(__MP_WEIXIN_ACTIVEBACK__)</code>、
        <code>inactiveMpBack(__MP_WEIXIN_INACTIVEBACK__)</code>
      </li>
    </ul>
    <button @click="activeMpBack()">activeMpBack()</button>
    <button @click="inactiveMpBack()">inactiveMpBack()</button>
  </section>
</template>

<script setup>
import onPageBack, { activeMpBack, inactiveMpBack } from 'mp-weixin-back-helper'

onPageBack(
  () => {
    console.log('[example] manual 页面回调触发')
  },
  { initialValue: false }
)
</script>
