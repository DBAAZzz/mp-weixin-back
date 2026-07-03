<template>
  <div>用户自带 onBeforeLeave 的页面</div>
</template>

<script>
export default {
  data() {
    return { backCount: 0, userCalled: false }
  },
  onPageBack() {
    this.backCount++
  },
  methods: {
    onBeforeLeave() {
      this.userCalled = true
    },
  },
}
</script>

<style></style>
