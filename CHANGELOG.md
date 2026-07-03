# mp-weixin-back

## 0.0.18

### Patch Changes

- 902a8cf: 按代码评审报告（docs/代码评审报告.md）全面重构：

  #### 正确性修复

  - 移除构建期 `new Function` 求值：per-page 配置改为 AST 静态提取字面量，非字面量给出可修复的构建报错
  - 修复全局 `onPageBack` 对象方法简写不传参的 bug；序列化前检测闭包引用并给出构建期警告
  - 平台门控：仅 `UNI_PLATFORM=mp-weixin`（或未设置）时转换，其他平台保留 no-op API
  - 修复 `buildStart` 未 await 的竞态；pages.json 变更自动重载；支持 HBuilderX 项目（根目录 pages.json）与 `subPackages`/`subpackages` 两种写法
  - `activeMpBack`/`inactiveMpBack` 调用改写从正则替换改为 AST 精确偏移插入，支持嵌套括号实参与任意表达式位置
  - import 匹配改为全等；调用识别基于 Babel 作用域 binding 校验（callee 必须解析到 helper 的 import specifier），本地同名函数、嵌套作用域遮蔽参数不再被误处理
  - per-page 配置按字段校验字面量类型：`frequency` 仅接受数字、`preventDefault`/`initialValue` 仅接受布尔，类型错误在构建期报错
  - composition 页面 `onPageBack` 第二参数为变量/表达式时构建期报错，不再静默回退全局配置
  - 注入的 beforeleave 处理函数改名为 `__MP_BACK_ON_BEFORE_LEAVE__`，不再与用户自定义的 `onBeforeLeave` 方法/变量冲突
  - options API 的 `data` 支持函数属性写法（`data: () => ({...})` / `data: function () {...}`），状态原位注入其返回对象；`data`/`methods` 存在但无法静态注入时构建期报错，不再插入会被同名键覆盖的重复键
  - `<script>` 与 `<script setup>` 并存时，setup 中无 onPageBack 注册则回落处理普通 script 的 onPageBack 选项
  - 只 import helper 未调用 onPageBack 的页面不再注入拦截逻辑（此前 import 即生效，会给无回调页面挂上默认 navigateBack）
  - 组件选项存在对象展开（`...base`）且可能覆盖注入内容或 `onPageBack` 本身时构建期报错（展开内容静态不可知，运行时覆盖会导致拦截失效或配置与回调不一致）

  #### 架构改进

  - transform 增加快速跳过（未使用 helper 的文件不再解析）；按扩展名 + query 精确过滤，跳过 `?vue` 子请求
  - composition / options 两条路径统一为 MagicString 原位增量编辑：不再重新生成 script、sourcemap 逐行精确、用户代码保持原位
  - options API 与 composition 对齐：支持 `initialValue`，新增 `{ handler, ...options }` 对象写法支持 per-page 配置
  - 页面门控：有 pages.json 时仅转换注册页面；错误不再静默（配置错误终止构建，意外错误警告后跳过；运行时 no-op 在 dev 下 console 警告）
  - 虚拟模块遵循 Rollup `\0` 约定
  - 新增 `pageContainer` 配置项（zIndex / overlay / duration）

  #### 工程化

  - 目录重组至 `src/`，移除 `@babel/generator` 依赖
  - 新增 CI（typecheck + test + build），release 前置 typecheck 与测试
  - 测试从 3 个扩展到 40 个（transform 单元测试、pages.json 解析、options API 三种写法、frequency 语义、binding 遮蔽、命名冲突、data 函数属性写法、双 script 块、对象展开等）

## 0.0.17

### Patch Changes

- 6430f76: 验证 changeset
