### 功能描述

监听手势返回和页面默认导航栏的返回事件

### 在项目中使用

#### 下载

```ts
npm install mp-weixin-back
```

#### 使用

`vite.config.ts` 中配置

```ts
import mpBackPlugin from 'mp-weixin-back'

export default defineConfig({
  plugins: [mpBackPlugin()],
})
```

具体的配置为：

```ts
type Config = {
  /**
   * 是否阻止默认的回退事件，默认为 false
   */
  preventDefault: boolean
  /**
   * 阻止次数，默认是 `1`
   */
  frequency: number
  /**
   * 页面回退时触发
   */
  onPageBack?: (params: BackParams) => void
}
```

在 vue3 中使用

```ts
import onPageBack from 'mp-weixin-back-helper'

onPageBack(() => {
  console.log('触发了手势返回')
})
```

onPageBack 的类型定义为：

```ts
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

function onPageBack(callback: () => void, params: Partial<Config>)
```

#### 引入类型

在项目目录中的`src/env.d.ts` 或`src/shime-uni.d.ts` 文件中引入

```
/// <reference types="mp-weixin-back/client" />
```

或在 `tsconfig.json` 的 `compilerOptions` 下配置

```json
{
  "compilerOptions": {
    "types": ["mp-weixin-back/client"]
  }
}
```

### todolist

- [ ] 兼容 uniapp 的 Vue2 项目
- [ ] debug 模式
- [ ] 热更新 pages.json 文件
- [ ] 单元测试
