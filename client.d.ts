declare module 'mp-weixin-back-helper' {
  type Config = {
    /**
     * 初始化时是否监听手势返回，默认值为`true`
     */
    initialValue: boolean
    /**
     * 是否阻止默认的回退事件，默认为 false
     */
    preventDefault: boolean
    /**
     * 阻止次数，默认是 `1`
     */
    frequency: number
  }

  function onPageBack(callback: () => void, params?: Partial<Config>)

  /**
   * 开启监听手势滑动事件
   */
  function activeMpBack()

  /**
   * 禁用监听手势滑动事件
   */
  function inactiveMpBack()

  export default onPageBack

  export { activeMpBack, inactiveMpBack }
}
