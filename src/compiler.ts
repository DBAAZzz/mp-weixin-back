import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { MpBackEnvironmentError } from './errors'

/**
 * 缓存的是**已成功加载**的 compiler，不是整个解析过程。
 *
 * 为什么不缓存 Promise：这条路径上的失败几乎都是「用户依赖没装好」（版本错配 /
 * 没装 compiler-sfc），而 watch 模式下用户会当场去修 package.json 再 install。
 * 若把 rejected Promise 也缓存住，修好之后仍然拿到同一个旧错误 —— 必须重启 dev
 * server 才能恢复，而报错里完全看不出这一点。曾经就是这样：一次失败把整个
 * watch 会话钉死。
 */
let compilerCache: { root: string; compiler: typeof import('@vue/compiler-sfc') } | null = null

/** 读一个包实际安装的版本号；读不到时返回 null（不阻断流程） */
function readPackageVersion(entryPath: string): string | null {
  try {
    // entryPath 形如 .../dist/compiler-sfc.cjs.js 或 .../index.js，一路向上找 package.json
    let dir = path.dirname(entryPath)
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    // 版本探测是尽力而为，失败不影响主流程
  }
  return null
}

/**
 * 校验 `@vue/compiler-sfc` 实际加载到的 `@vue/shared` 是否带 `genCacheKey`。
 *
 * 背景：`@vue/compiler-sfc@3.5.9+` 的 `parse()` 内部改成调用
 * `shared.genCacheKey(...)`，而 `genCacheKey` 是 `@vue/shared@3.5.9` 才加入的
 * （已核对 dist：3.5.8 的 CJS 产物 0 处、3.5.9 起 2 处）。
 * compiler-sfc 在自己 package.json 里 pin 了精确版本，正常安装不会错配；
 * 但包管理器**扁平化/提升**依赖时（pnpm 的 hoisted linker、npm 去重、
 * 陈旧 lockfile、手动 overrides），`@vue/shared` 可能被解析成旧版本，
 * 于是每个 .vue 都抛 `TypeError: shared.genCacheKey is not a function`。
 *
 * 这个错误本身极难定位（报错点在 compiler 内部，与用户代码无关），
 * 所以在解析阶段提前探测并给出可操作的提示。
 *
 * ⚠️ 探测方式必须是「**自己按 compiler-sfc 所在目录解析 @vue/shared**」：
 * compiler-sfc 的 CJS 产物内部就是 `require('@vue/shared')`，且它**并不导出**
 * `shared`（`compiler.shared` 恒为 undefined），所以不能去读 compiler 上的属性 ——
 * 那样写会在唯一会失败的场景里静默跳过校验（曾经踩过）。
 *
 * 导出仅为可测：两个调用点传的 `from` 不同（主路径传 compiler-sfc 入口、
 * 降级分支也解析出入口再传），「起点传错」正是踩过的坑，测试需要直接钉住这点。
 */
export function assertSharedCompat(_require: NodeRequire, from: string): void {
  // from 可能是 compiler-sfc 的入口文件，也可能是 import.meta.url；
  // 统一取「文件所在目录」作为解析起点，与 parse() 内部的 require 同上下文
  const baseDir = from.startsWith('file:') ? path.dirname(new URL(from).pathname) : path.dirname(from)
  let sharedPath: string
  try {
    sharedPath = _require.resolve('@vue/shared', { paths: [baseDir] })
  } catch {
    // 解析不到 shared 属于另一类问题（依赖缺失），交给后续实际调用暴露
    return
  }

  // Node 的 require 会记住「这个 specifier 从这儿解析到了这个路径」，且**不校验
  // 文件是否还在**：用户在 watch 会话里删掉那个被提升/重复安装的旧 shared 之后，
  // resolve 仍会返回已删除的路径，加载拿到的还是内存里那份旧模块（实测：删完
  // 文件、resolve 仍返回旧路径、genCacheKey 仍缺失）。于是「修好了依赖」这个
  // 场景反而被陈旧的解析缓存挡住，用户只能重启 dev server。这里按磁盘状态作废
  // 掉那条缓存，让下一次 resolve 重新走真实查找。
  if (!fs.existsSync(sharedPath)) {
    delete (_require as NodeRequire & { cache: NodeJS.Dict<NodeModule> }).cache[sharedPath]
    try {
      sharedPath = _require.resolve('@vue/shared', { paths: [baseDir] })
    } catch {
      return
    }
  }

  let shared: { genCacheKey?: unknown }
  try {
    shared = _require(sharedPath) as { genCacheKey?: unknown }
  } catch {
    return
  }
  if (typeof shared.genCacheKey === 'function') return

  const compilerVersion = readPackageVersion(from) ?? 'unknown'
  const sharedVersion = readPackageVersion(sharedPath) ?? 'unknown'

  throw new MpBackEnvironmentError(
    `@vue/compiler-sfc 与 @vue/shared 版本不匹配。\n` +
      `  @vue/compiler-sfc: ${compilerVersion}\n` +
      `  @vue/shared:       ${sharedVersion}（缺少 genCacheKey，需 >= 3.5.9）\n` +
      `compiler-sfc 3.5.9+ 的 parse() 依赖 @vue/shared 的 genCacheKey，` +
      `版本过旧时会在解析 SFC 时抛 TypeError。\n` +
      `通常是因为包管理器提升/扁平化了依赖。修复方式（任选其一）：\n` +
      `  - 对齐版本：\n` +
      `      pnpm add -D @vue/shared@${compilerVersion}\n` +
      `      npm  install --save-dev @vue/shared@${compilerVersion}\n` +
      `      yarn add -D @vue/shared@${compilerVersion}\n` +
      `  - 强制对齐（在 package.json 里按你的包管理器选一个字段）：\n` +
      `      pnpm → "pnpm":       { "overrides":   { "@vue/shared": "${compilerVersion}" } }\n` +
      `      npm  → "overrides":  { "@vue/shared": "${compilerVersion}" }\n` +
      `      yarn → "resolutions":{ "@vue/shared": "${compilerVersion}" }\n` +
      `  - 重新安装：删掉 node_modules 与 lockfile 后重装\n` +
      `      （lockfile 按包管理器为 pnpm-lock.yaml / package-lock.json / yarn.lock）`
  )
}

/**
 * 解析出这次要用的 compiler-sfc 入口及其**真实包根**。
 *
 * 返回包根而不是入口文件：校验起点、加载、报错里的路径三者都以它为基准，
 * 避免各处各自 dirname 一次、算出不同的目录。
 *
 * 解析顺序：先从用户项目根解析（正常安装走这条），失败再退回插件自身位置
 * （用户没装 compiler-sfc 时用插件依赖树里那份兜底）。
 */
function resolveCompilerEntry(_require: NodeRequire, root: string): string | null {
  try {
    return _require.resolve('@vue/compiler-sfc', { paths: [root] })
  } catch {
    try {
      return _require.resolve('@vue/compiler-sfc')
    } catch {
      return null
    }
  }
}

export async function resolveCompiler(root: string): Promise<typeof import('@vue/compiler-sfc')> {
  // 只缓存**成功**的结果，且按 root 区分：换 root 时重新解析。（见 compilerCache 注释）
  if (compilerCache && compilerCache.root === root) {
    return compilerCache.compiler
  }

  const _require = createRequire(import.meta.url)
  const compilerPath = resolveCompilerEntry(_require, root)

  if (compilerPath) {
    // 校验起点是 compiler-sfc 的入口：从它出发解析 @vue/shared，与 parse() 内部
    // 的 require 同上下文。不能传 root —— pnpm 严格布局下 @vue/shared 不会被提升
    // 到项目根，从 root 解析会失败、静默跳过校验，于是「唯一会失败」的场景反而
    // 不校验（曾经踩过，CR 复现）。
    assertSharedCompat(_require, compilerPath)

    const compiler = _require(compilerPath) as typeof import('@vue/compiler-sfc')
    compilerCache = { root, compiler }
    return compiler
  }

  throw new Error(
    `[mp-weixin-back] Cannot resolve @vue/compiler-sfc.\n` +
      `This plugin requires @vue/compiler-sfc to be installed in your project.\n` +
      `Fix: pnpm add -D @vue/compiler-sfc\n` +
      `Docs: https://github.com/DBAAZzz/mp-weixin-back#%EF%B8%8F-vite-配置\n`
  )
}
