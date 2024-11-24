<template>
  <div>我是默认的界面</div>
</template>

<script setup>
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  console.log('触发了手势返回')
})
</script>

<style></style>
