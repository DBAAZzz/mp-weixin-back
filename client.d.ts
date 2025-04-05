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

  function onPageBack(
    callback:() => void,
    params: Partial<Config>
  )

  export default onPageBack
}