<template>
  <div>options API 函数属性写法</div>
</template>

<script>
export default {
  data() {
    return { backCount: 0 }
  },
  onPageBack: function () {
    this.backCount++
  },
  methods: {
    existing() {
      return 'existing'
    },
  },
}
</script>

<style></style>
