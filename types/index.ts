/**
 * Parameters passed to the onPageBack callback.
 */
export type BackParams = {
  /**
   * The path of the current page that triggered the back event.
   * @example 'pages/index/index'
   */
  page: string
}

/**
 * Per-page options for `onPageBack()`.
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
   * @example
   * mpBackPlugin({
   *   onPageBack: ({ page }) => console.log('back on:', page)
   * })
   */
  onPageBack?: (params: BackParams) => void
}

export type UserOptions = Partial<Config>

export type ContextConfig = Config & {
  mode: string
  root: string
}

type Pages = { path: string }[]

export type PagesJson = {
  pages: Pages
  subpackages: { root: string; pages: Pages }[]
}
