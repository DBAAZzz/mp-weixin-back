---
'mp-weixin-back': patch
---

修复 `@vue/compiler-sfc` / `@vue/shared` 版本错配的探测与恢复：

- 依赖被修复后仍报陈旧错误：把旧 `@vue/shared` 原地替换成新版（路径不变）时，插件会从模块缓存里取回旧模块，继续报「版本不匹配」——即使用户已经按报错里的指引修好了。现在重试时会同时作废解析结果与模块实例缓存。
- 修复后重新解析仍指向已删除路径时，改为静默跳过校验，不再报出「两个版本号相同却说不匹配」的自相矛盾错误。
- `@vue/compiler-sfc` 能解析但加载失败（装坏了）时，给出包含路径、原因与修复方式的可操作报错，不再直接抛出 `dlopen failed` 这类与插件无关的原始错误。

发布流程改为「合并到 main 即发布」：

- 不再依赖 `changesets/action`。该 action 按工作区里 `.changeset/*.md` 是否存在决定「开版本 PR 还是发布」，而 `changeset version` 只把删除暂存（工作区文件仍在），会被误判成「还有 changeset」而**根本不发布**；其发布判定还依赖 stdout 里的 `New tag:`，自定义发布脚本不打印该行，结论恒为「未发布」。
- 现在由工作流自己跑 `changeset version` → 提交回 `main` → 直接执行 `pnpm release`，发布与否以脚本里的 `isPublished()` 为准。

新增 `example/web` 验证工程与 `pnpm test:all`：

- `pnpm test:all` = 根套件 + `example/web` 套件，**两者都过才算测试通过**，CI 与发布门禁都用它。
- `example/web` 走真实 Vite 管线，验证插件被正确挂载以及 `pages.json` 页面门控的放行/拦截，补上了单测覆盖不到的一层。
