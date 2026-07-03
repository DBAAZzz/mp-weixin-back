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
