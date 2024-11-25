export type UserOptions = Partial<Config>

export type Config = {
  /**
   * 是否阻止默认的回退事件，默认为 false
   */
  preventDefault: boolean
  /**
   * 阻止次数，默认是 `1`
   */
  frequency: number
  /**
   * 调试模式
   */
  debug: boolean
  /**
   * 页面回退时触发
   */
  onPageBack?: (params: BackParams) => void
}

export type BackParams = {
  /**
   * 当前页面路径
   */
  page: string
}

export type ContextConfig = Config & {
  mode: string
  root: string
}

type Pages = { path: string }[]

export type PagesJson = {
  pages: Pages
  subpackages: { root: string; pages: Pages }[]
}
