import { describe, expect, it, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

/**
 * `resolveCompiler` 的环境校验回归测试。
 *
 * 背景（真实用户报障）：`@vue/compiler-sfc@3.5.9+` 的 `parse()` 内部改调
 * `shared.genCacheKey(...)`，而 `genCacheKey` 是 `@vue/shared@3.5.9` 才加入的
 * （核对过 dist：3.5.8 的 CJS 产物 0 处、3.5.9 起 2 处）。compiler-sfc 在自己的
 * package.json 里 pin 了精确版本，正常安装不会错配；但包管理器**提升/扁平化**
 * 依赖时（pnpm hoisted linker、npm 去重、陈旧 lockfile、手动 overrides），
 * `@vue/shared` 会被解析成旧版本，于是每个 .vue 都抛：
 *
 *     TypeError: shared.genCacheKey is not a function
 *
 * 报错点在 compiler 内部、与用户代码毫无关系，极难定位。插件必须在解析阶段
 * 提前探测、给出可操作的版本对齐提示，而不是把这个 TypeError 抛给用户。
 *
 * 测试手法：在仓库外造一棵**自洽**的假依赖树（新版 compiler-sfc + 缺
 * genCacheKey 的旧 shared），让 resolveCompiler 去解析它 —— 而不是直接调内部
 * 函数，那样就测不到「Node 把 @vue/shared 解析到了哪一份」这个真正的失败环节。
 */

const fixtureRoots: string[] = []

afterAll(() => {
  for (const dir of fixtureRoots) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const _require = createRequire(import.meta.url)
/** 仓库根：从 test/ 上跳一级 */
const repoRoot = path.resolve(__dirname, '..')

/**
 * 把 srcDir 下的条目摊平复制进 dstDir（npm 扁平化后的形态）。
 *
 * 必须复制**整棵依赖闭包**：compiler-sfc 的入口在 dist/ 下，但它 require 的
 * @vue/compiler-core / postcss / entities 等在包外（依赖树里）。只复制包自己的
 * dist 会让 require 直接抛 MODULE_NOT_FOUND，掉进 resolveCompiler 的「装不上」
 * 分支，就测不到我们真正要测的版本校验了。
 */
function copyFlat(srcDir: string, dstDir: string): void {
  for (const entry of fs.readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue
    const src = path.join(srcDir, entry)
    const dst = path.join(dstDir, entry)
    if (entry.startsWith('@')) {
      fs.mkdirSync(dst, { recursive: true })
      for (const sub of fs.readdirSync(src)) {
        if (fs.existsSync(path.join(dst, sub))) continue
        fs.cpSync(fs.realpathSync(path.join(src, sub)), path.join(dst, sub), { recursive: true })
      }
    } else if (!fs.existsSync(dst)) {
      fs.cpSync(fs.realpathSync(src), dst, { recursive: true })
    }
  }
}

/**
 * 造一棵仓库外的自洽依赖树：以仓库当前装的 @vue/compiler-sfc 为起点，把它整棵
 * 依赖闭包（@vue/compiler-core、postcss、entities…）从 .pnpm 里摊平复制出来，
 * 模拟 npm 扁平化 / HBuilderX 那种 node_modules 形态。
 *
 * 放在**仓库外**是必须的：放在仓库内时，Node 会从 fixture 一路向上走回仓库的
 * node_modules，命中仓库里那份正确的 @vue/shared，错配就复现不出来了。
 */
function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-back-compiler-'))
  fixtureRoots.push(root)
  const flat = path.join(root, 'node_modules')
  fs.mkdirSync(flat, { recursive: true })

  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm')
  // .pnpm 里的包目录名形如 @vue+compiler-sfc@3.5.28
  const sfcKey = fs
    .readdirSync(pnpmDir)
    .find((d) =>
      fs.existsSync(path.join(pnpmDir, d, 'node_modules', '@vue', 'compiler-sfc'))
    )!

  // BFS 整棵依赖闭包，逐层摊平复制
  const queue = [sfcKey]
  const visited = new Set<string>()
  while (queue.length) {
    const key = queue.shift()!
    if (visited.has(key)) continue
    visited.add(key)
    const pkgModules = path.join(pnpmDir, key, 'node_modules')
    if (!fs.existsSync(pkgModules)) continue
    copyFlat(pkgModules, flat)
    for (const entry of fs.readdirSync(pkgModules)) {
      if (entry.startsWith('.')) continue
      const names = entry.startsWith('@')
        ? fs.readdirSync(path.join(pkgModules, entry)).map((s) => `${entry}+${s}`)
        : [entry]
      for (const name of names) {
        for (const cand of fs.readdirSync(pnpmDir)) {
          if (cand === name || cand.startsWith(`${name}@`)) queue.push(cand)
        }
      }
    }
  }
  return root
}

/**
 * 在 fixture 里把 compiler-sfc 自己 node_modules 下的 @vue/shared 换成「旧版」替身：
 * 只缺 genCacheKey。
 *
 * 不复刻真实 3.4.x 的全部导出 —— 被测行为只取决于 genCacheKey 是否存在，
 * 而 vendor 一份第三方包进仓库既笨重、又会随上游发版过时。version 字段要写对，
 * 断言里会用到它。
 */
function writeLegacyShared(fixtureRoot: string, version = '3.4.21'): void {
  const destDir = path.join(
    fixtureRoot,
    'node_modules',
    '@vue',
    'compiler-sfc',
    'node_modules',
    '@vue',
    'shared'
  )
  fs.mkdirSync(destDir, { recursive: true })
  fs.writeFileSync(
    path.join(destDir, 'package.json'),
    JSON.stringify({ name: '@vue/shared', version, main: 'index.js' }, null, 2)
  )
  // 刻意不带 genCacheKey，其余导出给不给都行
  fs.writeFileSync(
    path.join(destDir, 'index.js'),
    `module.exports = { extend: Object.assign, isArray: Array.isArray }\n`
  )
}

/** 每个用例都重新 import，绕开模块级的 compilerPromise 缓存 */
async function loadResolveCompiler(tag: string) {
  const mod = await import(/* @vite-ignore */ `../src/compiler?case=${tag}`)
  return mod.resolveCompiler as (root: string) => Promise<{ parse: unknown }>
}

describe('resolveCompiler 环境校验', () => {
  it('@vue/shared 版本过旧时：报版本不匹配，而不是 genCacheKey TypeError', async () => {
    const root = makeFixture()
    writeLegacyShared(root)
    const resolveCompiler = await loadResolveCompiler('mismatch')

    const error = await resolveCompiler(root).then(
      () => null,
      (e: unknown) => e as Error
    )

    expect(error, '版本错配必须抛错，不能静默通过').not.toBeNull()
    // 核心：用户看到的不该是 compiler 内部那句无从下手的 TypeError
    expect(error!.message).not.toContain('genCacheKey is not a function')
    expect(error!.message).toContain('版本不匹配')
    expect(error!.message).toContain('@vue/shared')
    // 版本号要具体，用户才知道该对齐到哪个版本
    expect(error!.message).toContain('3.4.21')
    // 必须给出可操作的修复方式
    expect(error!.message).toMatch(/pnpm add|overrides|lockfile/)
  })

  it('依赖正常时：正常返回 compiler，不误报', async () => {
    const root = makeFixture()
    const resolveCompiler = await loadResolveCompiler('ok')

    const compiler = await resolveCompiler(root)
    expect(typeof compiler.parse).toBe('function')
  })

  it('真实环境中 resolveCompiler 可用（不误报当前仓库）', async () => {
    const resolveCompiler = await loadResolveCompiler('self')
    const compiler = await resolveCompiler(process.cwd())
    expect(typeof compiler.parse).toBe('function')
  })
})
