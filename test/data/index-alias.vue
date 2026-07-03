<template>
  <div>别名 import 的页面</div>
</template>

<script setup>
import back from 'mp-weixin-back-helper'

back(() => {
  console.log('别名回调触发')
})
</script>

<style></style>
