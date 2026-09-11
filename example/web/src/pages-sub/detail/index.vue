<template>
  <section>
    <h2>pages-sub/detail — 分包页面</h2>
    <p>
      这一页位于分包 <code>pages-sub</code> 下，只在 <code>pages.json</code> 的
      <code>subPackages[].pages</code> 里注册。
    </p>
    <p>
      <b>预期产物：</b>与主包页面一样正常注入 <code>&lt;page-container&gt;</code> 与
      beforeleave 处理函数，且全局 hook 的实参是
      <code>{"page":"pages-sub/detail/index"}</code>（分包路径拼接正确）。
    </p>
  </section>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  console.log('[example] 分包页面回调触发')
})
</script>
