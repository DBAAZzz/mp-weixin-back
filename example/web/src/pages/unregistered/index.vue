<template>
  <section>
    <h2>unregistered — 用了 helper 但不在 pages.json（门控跳过）</h2>
    <p>
      这一页 import 了 helper 并调用了 <code>onPageBack</code>，但<b>没有</b>注册在
      <code>src/pages.json</code> 里。插件的页面门控会跳过它——因为
      <code>page-container</code> 只在页面级生效，组件里注入没有意义。
    </p>
    <p><b>预期产物：</b></p>
    <ul>
      <li>transform 产物与源码一致（未注入）：import 语句原样保留，注册调用原样保留为死代码</li>
      <li>终端 debug 日志出现「不是 pages.json 中注册的页面，跳过注入」——这是判断该页被门控跳过的<b>唯一</b>线索</li>
    </ul>
    <p>
      <b>注意：这一页 console 是干净的，不会有任何警告。</b>
      因为该页确实 import 了 helper，它通过了 <code>src/index.ts</code> 的快速跳过门，
      是在页面门控处 return 的——根本没走到虚拟模块的 no-op 分支，
      自然也不会触发那段警告。no-op 警告只在<b>页面压根没被插件处理、却仍 import 了
      helper 并使用其导出</b>时才可能出现，属于运行时行为，不在本工程的 transform 验证范围内。
    </p>
    <p>所以排查"插件为什么没生效"，请先看<span>终端 debug 日志</span>，而不是浏览器 console。</p>
  </section>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

// 这里注册的回调在 web 上永远不会触发——该页面被插件门控跳过了。
// 注意它也不会触发任何警告：调用被原样保留，只是没人调用它。
onPageBack(() => {
  console.log('[example] unregistered 页面回调触发')
})
</script>
