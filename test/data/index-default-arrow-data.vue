<template>
  <div>data 为箭头函数属性的页面</div>
</template>

<script>
export default {
  data: () => ({ backCount: 0 }),
  onPageBack() {
    this.backCount++
  },
}
</script>

<style></style>
