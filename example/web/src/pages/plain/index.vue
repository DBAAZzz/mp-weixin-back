<template>
  <section>
    <h2>plain — 注册页面但完全不用插件（快速跳过）</h2>
    <p>
      这一页在 <code>pages.json</code> 里，但既不 import helper、也没有
      <code>onPageBack</code> 选项。
    </p>
    <p>
      <b>预期产物：</b>与源码完全一致，且<b>不会</b>出现该页面的处理日志。
    </p>
    <p>
      跳过发生在「script setup 里没有来自 helper 的注册调用」这一步——插件确认无
      <code>onPageBack</code> 可挂钩后直接返回，不注入、也不打日志。
      （这里有个易错点：本页模板的说明文字里恰好含 <code>onPageBack</code> 字样，
      因此它其实<b>通过</b>了插件入口处那道基于字符串的快速跳过门，
      是走到后续检查才被挡下的。纯看日志无法区分这两种跳过，两者都不打日志。）
    </p>
    <p>计数：{{ count }}</p>
    <button @click="count++">count++</button>
  </section>
</template>

<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>
