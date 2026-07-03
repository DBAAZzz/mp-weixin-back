/** 用户代码中 import 的模块名（虚拟模块） */
export const virtualFileId = 'mp-weixin-back-helper'

/** Rollup 约定：虚拟模块的 resolved id 加 \0 前缀，防止其他插件误解析 */
export const resolvedVirtualFileId = '\0' + virtualFileId

/** options API 中约定的钩子选项名 */
export const ON_PAGE_BACK = 'onPageBack'

/**
 * 注入的 beforeleave 处理函数名。
 * 使用内部前缀命名，避免与用户自定义的 onBeforeLeave 方法/变量冲突
 * （对象重名键会让用户方法覆盖注入逻辑，script setup 重名 const 会直接语法报错）
 */
export const BEFORE_LEAVE_HANDLER = '__MP_BACK_ON_BEFORE_LEAVE__'
