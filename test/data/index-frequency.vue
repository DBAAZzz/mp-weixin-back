<template>
  <div>frequency 拦截页面</div>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(
  () => {
    console.log('frequency 回调触发')
  },
  {
    preventDefault: true,
    frequency: 3,
  }
)
</script>

<style></style>
