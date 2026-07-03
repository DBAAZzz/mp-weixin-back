/** 用户代码中 import 的模块名（虚拟模块） */
export const virtualFileId = 'mp-weixin-back-helper'

/** Rollup 约定：虚拟模块的 resolved id 加 \0 前缀，防止其他插件误解析 */
export const resolvedVirtualFileId = '\0' + virtualFileId

/** options API 中约定的钩子选项名 */
export const ON_PAGE_BACK = 'onPageBack'
