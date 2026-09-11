<template>
  <section>
    <h2>form — per-page 字面量覆盖全局</h2>
    <p>
      <code>onPageBack(cb, { preventDefault: true, frequency: 3 })</code>
      —— 表单页的典型用法：拦住返回，弹确认框后再自行放行。
    </p>
    <p><b>预期产物：</b></p>
    <ul>
      <li><code>__MP_BACK_FREQUENCY__ &lt; 3</code>（页面级字面量覆盖了全局的 1）</li>
      <li><b>没有</b> <code>uni.navigateBack</code>（preventDefault 为 true）</li>
    </ul>
    <p>
      <b>反面对照：</b>把第二个参数换成变量（如
      <code>const opts = {...}; onPageBack(cb, opts)</code>）会直接构建报错——
      配置在构建期静态读取，只接受内联对象字面量。
    </p>
  </section>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(
  () => {
    console.log('[example] form 页面回调触发（拦截中，不会真的返回）')
  },
  { preventDefault: true, frequency: 3 }
)
</script>
