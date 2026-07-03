<template>
  <div>options API 对象写法（per-page 配置）</div>
</template>

<script>
export default {
  onPageBack: {
    preventDefault: true,
    handler() {
      this.backCount++
    },
  },
  data() {
    return { backCount: 0 }
  },
}
</script>

<style></style>
