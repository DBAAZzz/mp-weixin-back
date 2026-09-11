/**
 * 用户配置错误（可自行修复），transform 入口捕获后通过 this.error 终止构建，
 * 与意外异常（警告后跳过该文件）区分处理。
 */
export class MpBackConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MpBackConfigError'
  }
}

/**
 * 构建环境/依赖问题（如 @vue/compiler-sfc 与 @vue/shared 版本错配）。
 *
 * 与 MpBackConfigError 分开，是因为它的成因不在插件配置里、而在用户的依赖树，
 * 但两者都必须**终止构建**：这类问题会让**每一个** .vue 页面都转换失败，
 * 若只降级成警告，构建照样打印成功、页面却全部静默失去返回拦截 —— 比直接
 * 报错危险得多。
 */
export class MpBackEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MpBackEnvironmentError'
  }
}
