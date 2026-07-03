/**
 * Parameters passed to the onPageBack callback.
 */
export type BackParams = {
  /**
   * The path of the current page that triggered the back event.
   * `null` when the page path cannot be resolved (e.g. pages.json not found).
   * @example 'pages/index/index'
   */
  page: string | null
}

/**
 * Per-page options for `onPageBack()`.
 *
 * 这些值在构建期静态读取，必须是布尔/数字字面量。
 */
export type OnPageBackOptions = {
  /**
   * Whether to block the default back navigation for this page.
   * When `true`, the user stays on the current page and only the callback fires.
   * @default false
   * @example
   * onPageBack(() => showDialog(), { preventDefault: true })
   */
  preventDefault: boolean

  /**
   * How many times to intercept the back event before allowing through.
   * Set to a large number (e.g. `9999`) for persistent interception.
   * @default 1
   * @example
   * // Block 3 times, then allow back
   * onPageBack(() => {}, { frequency: 3 })
   */
  frequency: number

  /**
   * Whether to start listening immediately when the page mounts.
   * Set to `false` to start disabled and enable manually via `activeMpBack()`.
   * @default true
   * @example
   * // Start disabled, enable after user action
   * onPageBack(() => {}, { initialValue: false })
   * activeMpBack()
   */
  initialValue: boolean
}

/**
 * 注入的 page-container 组件属性。
 */
export type PageContainerOptions = {
  /**
   * z-index of the injected page-container.
   * @default 1
   */
  zIndex?: number

  /**
   * Whether to show the overlay.
   * @default false
   */
  overlay?: boolean

  /**
   * Animation duration in ms, or `false` to disable.
   * @default false
   */
  duration?: number | boolean
}

/**
 * Global plugin options passed to `mpBackPlugin()` in `vite.config.ts`.
 */
export type Config = OnPageBackOptions & {
  /**
   * Enable debug logging in development mode.
   * @default false
   */
  debug: boolean

  /**
   * Global callback fired every time a back event is detected on any page.
   * Page-level callbacks registered via `onPageBack()` run in addition to this.
   *
   * ⚠️ 该函数会被序列化注入到页面代码中，必须自包含：
   * 不能引用 vite.config.ts 中的闭包变量或 import 的模块。
   * @example
   * mpBackPlugin({
   *   onPageBack: ({ page }) => console.log('back on:', page)
   * })
   */
  onPageBack?: (params: BackParams) => void

  /**
   * 注入的 page-container 组件属性。
   */
  pageContainer?: PageContainerOptions
}

export type UserOptions = Partial<Config>

export type ContextConfig = Config & {
  mode: string
  root: string
}

/** 构建期最终生效的拦截配置（全局配置 + per-page 字面量合并后） */
export type ResolvedBackConfig = {
  preventDefault: boolean
  frequency: number
  initialValue: boolean
}

type Pages = { path: string }[]

export type PagesJson = {
  pages?: Pages
  /** uni-app 同时接受两种大小写写法 */
  subpackages?: { root: string; pages: Pages }[]
  subPackages?: { root: string; pages: Pages }[]
}

/**
 * SFC block 的最小结构（模板/脚本通用），
 * 只声明本插件用到的字段，与 @vue/compiler-sfc 的版本解耦。
 */
export type SfcBlock = {
  content: string
  lang?: string
  loc: {
    start: { offset: number }
    end: { offset: number }
  }
}
