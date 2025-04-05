<template>
  <div>我是默认的界面</div>
  <button id="button" @click="disableMpBack"></button>
  <button id="button2" @click="activeMpBack"></button>
</template>

<script setup>
import onPageBack, { activeMpBack as mpppacitve, inactiveMpBack } from 'mp-weixin-back-helper'

onPageBack(
  () => {
    console.log('触发了手势返回')
  },
  {
    initialValue: false,
  }
)

const activeMpBack = () => {
  console.log('执行了activeMpBack')
  mpppacitve()
}

const disableMpBack = () => {
  inactiveMpBack()
}
</script>

<style></style>
