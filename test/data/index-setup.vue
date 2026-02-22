<template>
  <div>我是默认的界面</div>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  console.log('触发了手势返回！')
  return true
})
</script>

<style></style>
