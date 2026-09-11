<template>
  <section>
    <h2>options-shorthand — 选项式 API 方法简写</h2>
    <p>普通 <code>&lt;script&gt;</code> 中直接写 <code>onPageBack() {}</code>，配置取 vite 全局配置。</p>
    <p><b>预期产物：</b></p>
    <ul>
      <li><code>data()</code> 返回的对象里原位多出 <code>__MP_BACK_SHOW_PAGE_CONTAINER__</code> 与 <code>__MP_BACK_FREQUENCY__</code>，用户的 <code>msg</code> 原样保留</li>
      <li><code>methods</code> 里注入 <code>__MP_BACK_ON_BEFORE_LEAVE__()</code></li>
      <li>beforeleave 内经 <code>this.$options.onPageBack</code> 调用用户回调（回调保持原位，未被重新生成）</li>
    </ul>
    <p>data 里的值：{{ msg }}</p>
  </section>
</template>

<script>
export default {
  data() {
    return {
      msg: '这段 data 是用户自己写的，注入的状态应与它并存',
    }
  },
  onPageBack() {
    console.log('[example] options-shorthand 回调触发，this.msg =', this.msg)
  },
}
</script>
