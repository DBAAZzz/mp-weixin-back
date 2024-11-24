declare module 'mp-weixin-back-helper' {
  type Config = {
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