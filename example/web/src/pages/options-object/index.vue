<template>
  <section>
    <h2>options-object — 选项式 API 对象写法</h2>
    <p>
      <code>onPageBack: { handler, preventDefault, frequency }</code>
      —— 选项式 API 也能做页面级配置，与 composition API 对齐。
    </p>
    <p><b>预期产物：</b></p>
    <ul>
      <li><code>this.__MP_BACK_FREQUENCY__ &lt; 2</code>（对象写法里的字面量被静态提取）</li>
      <li><b>没有</b> <code>uni.navigateBack</code>（页面级 <code>preventDefault: true</code>）</li>
      <li><code>handler()</code> 方法由运行时通过 <code>this.$options.onPageBack.handler</code> 调用</li>
    </ul>
    <p>data 里的值：{{ msg }}</p>
  </section>
</template>

<script>
export default {
  data() {
    return {
      msg: '对象写法与函数写法在 data 注入上没有区别',
    }
  },
  onPageBack: {
    preventDefault: true,
    frequency: 2,
    handler() {
      console.log('[example] options-object 回调触发，this.msg =', this.msg)
    },
  },
}
</script>
