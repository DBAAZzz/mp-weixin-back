<template>
  <section>
    <h2>index — 走 vite 全局配置</h2>
    <p>
      <code>onPageBack(cb)</code> 没有第二个参数，所有配置来自
      <code>vite.config.ts</code>（<code>preventDefault: false</code
      >、<code>frequency: 1</code>）。
    </p>
    <p><b>预期产物：</b></p>
    <ul>
      <li>模板末尾注入 <code>&lt;page-container&gt;</code>，其 <code>show</code> 绑定状态 ref</li>
      <li><code>useMpWeixinBack(true)</code>（全局 <code>initialValue</code>）</li>
      <li>beforeleave 里出现 <code>__MP_BACK_FREQUENCY__ &lt; 1</code></li>
      <li>出现 <code>uni.navigateBack({ delta: 1 })</code>（全局未开 preventDefault）</li>
      <li>出现序列化后的全局 hook 调用及其 <code>{"page":"pages/index/index"}</code> 实参</li>
    </ul>
  </section>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  console.log('[example] index 页面回调触发')
})
</script>
