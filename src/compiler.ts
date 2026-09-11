import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { MpBackEnvironmentError } from './errors'

let compilerPromise: Promise<typeof import('@vue/compiler-sfc')> | null = null

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

export async function resolveCompiler(root: string): Promise<typeof import('@vue/compiler-sfc')> {
  // 避免重复解析（防止并发调用时的竞态条件）
  if (compilerPromise) {
    return compilerPromise
  }

  compilerPromise = (async () => {
    // 提到 try 外层：降级分支（下面的 catch）也要用它，声明在 try 里会出作用域，
    // 触发 ReferenceError 并被 catch 吞成一句没有信息量的「Cannot resolve」
    const _require = createRequire(import.meta.url)
    // 尝试加载用户项目中的 @vue/compiler-sfc
    try {
      // 尝试从用户根目录解析
      const compilerPath = _require.resolve('@vue/compiler-sfc', { paths: [root] })
      assertSharedCompat(_require, compilerPath)
      const compiler = _require(compilerPath) as typeof import('@vue/compiler-sfc')
      return compiler
    } catch (error) {
      // 版本错配是我们主动抛出的、可操作的错误：原样上抛，不要被下面的
      // 降级分支吞掉（否则又变回一个没有信息量的报错）
      if (error instanceof MpBackEnvironmentError) throw error

      try {
        // 降级尝试从插件自身位置加载。校验仍要**从 compiler-sfc 自己的位置**出发
        // 解析 @vue/shared，不能传 root —— pnpm 严格布局下 @vue/shared 不会被提升到
        // 项目根，传 root 会解析失败、走进 assertSharedCompat 的 catch 静默返回，
        // 于是「唯一会失败」的场景反而跳过校验（曾经踩过，CR 复现）。
        //
        // ⚠️ 解析、校验、加载必须走**同一套机制**（都用 CJS _require）：@vue/shared
        // 的 exports map 给 `require` 和 `import` 指了不同的文件
        // （require → index.js→dist/shared.cjs.js，import → dist/shared.esm-bundler.js）。
        // 若用 CJS 校验、却用 ESM import() 加载，两者理论上可以落到不同的包副本上，
        // 校验的就不是真正被 parse() 用的那一份（CR 指出，实测当前布局未触发）。
        // 统一成 _require 后这个差异不存在了。
        let from: string
        try {
          from = _require.resolve('@vue/compiler-sfc', { paths: [root] })
        } catch {
          from = _require.resolve('@vue/compiler-sfc')
        }
        assertSharedCompat(_require, from)
        const compiler = _require(from) as typeof import('@vue/compiler-sfc')
        return compiler
      } catch (secondary) {
        if (secondary instanceof MpBackEnvironmentError) throw secondary
        throw new Error(
          `[mp-weixin-back] Cannot resolve @vue/compiler-sfc.\n` +
            `This plugin requires @vue/compiler-sfc to be installed in your project.\n` +
            `Fix: pnpm add -D @vue/compiler-sfc\n` +
            `Docs: https://github.com/DBAAZzz/mp-weixin-back#%EF%B8%8F-vite-配置\n`
        )
      }
    }
  })()

  return compilerPromise
}
