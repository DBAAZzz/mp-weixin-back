declare module 'mp-weixin-back-helper' {
  /**
   * Per-page options for `onPageBack()`.
   */
  type OnPageBackOptions = {
    /**
     * Whether to block the default back navigation for this page.
     * When `true`, the user stays on the current page and only the callback fires.
     * @default false
     */
    preventDefault?: boolean

    /**
     * How many times to intercept the back event before allowing through.
     * Set to a large number (e.g. `9999`) for persistent interception.
     * @default 1
     */
    frequency?: number

    /**
     * Whether to start listening immediately when the page mounts.
     * Set to `false` and call `activeMpBack()` manually to enable later.
     * @default true
     */
    initialValue?: boolean
  }

  /**
   * Listen to back navigation events (gesture back + navbar back button) on the current page.
   *
   * Must be called inside `<script setup>` at the top level.
   *
   * @param callback - Function to call when back navigation is detected.
   * @param options - Optional per-page configuration. Overrides global plugin config.
   *
   * @example
   * // Basic usage
   * import onPageBack from 'mp-weixin-back-helper'
   *
   * onPageBack(() => {
   *   console.log('back detected')
   * })
   *
   * @example
   * // Prevent back and show a confirmation dialog
   * import onPageBack from 'mp-weixin-back-helper'
   *
   * onPageBack(
   *   () => {
   *     uni.showModal({
   *       title: '提示',
   *       content: '确定要返回吗？',
   *       success: (res) => {
   *         if (res.confirm) uni.navigateBack()
   *       },
   *     })
   *   },
   *   { preventDefault: true }
   * )
   *
   * @example
   * // Start disabled, enable after a button click
   * import onPageBack, { activeMpBack, inactiveMpBack } from 'mp-weixin-back-helper'
   *
   * onPageBack(() => { handleBack() }, { initialValue: false })
   *
   * function startListening() { activeMpBack() }
   * function stopListening() { inactiveMpBack() }
   */
  function onPageBack(callback: () => void, options?: OnPageBackOptions): void

  /**
   * Enable the back event listener for the current page.
   *
   * Use when `initialValue: false` was passed to `onPageBack()`,
   * or to re-enable after calling `inactiveMpBack()`.
   *
   * Must be called inside `<script setup>`.
   *
   * @example
   * import { activeMpBack } from 'mp-weixin-back-helper'
   *
   * // Enable on button click
   * function handleEnable() {
   *   activeMpBack()
   * }
   */
  function activeMpBack(): void

  /**
   * Disable the back event listener for the current page.
   *
   * The page will resume its default back behavior until `activeMpBack()` is called again.
   *
   * Must be called inside `<script setup>`.
   *
   * @example
   * import { inactiveMpBack } from 'mp-weixin-back-helper'
   *
   * // Disable when a modal is open
   * function handleModalOpen() {
   *   inactiveMpBack()
   * }
   */
  function inactiveMpBack(): void

  export default onPageBack
  export { activeMpBack, inactiveMpBack }
}
