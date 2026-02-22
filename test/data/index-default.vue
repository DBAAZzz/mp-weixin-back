<template>
  <div>我是默认的界面</div>
</template>

<script>
export default {
  data() {
    return {}
  },
  onPageBack() {
    console.log('触发了手势返回！')
    return true
  },
}
</script>

<style></style>
