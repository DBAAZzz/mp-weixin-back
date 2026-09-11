import { describe, expect, it, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { MpBackEnvironmentError } from '../src/errors'

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
 * 造一棵仓库外的自洽依赖树：以仓库当前装的 @vue/compiler-sfc 为起点，把它整棵
 * 依赖闭包（@vue/compiler-core、postcss、entities…）摊平复制出来，模拟 npm
 * 扁平化 / HBuilderX 那种 node_modules 形态。
 *
 * 放在**仓库外**是必须的：放在仓库内时，Node 会从 fixture 一路向上走回仓库的
 * node_modules，命中仓库里那份正确的 @vue/shared，错配就复现不出来了。
 *
 * 依赖闭包的发现方式是**顺着真实解析结果走**（resolve 每个依赖 → 拿到它的包目录
 * → 读它的 dependencies 继续），而不是去猜 pnpm 的目录命名（`@scope+name@ver`
 * 是 .pnpm 的实现细节，pnpm 改版就会失效）。这样 npm / yarn / pnpm 各种布局
 * 都成立，也不依赖 lockfile 的形态。
 */
function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-back-compiler-'))
  fixtureRoots.push(root)
  const flat = path.join(root, 'node_modules')
  fs.mkdirSync(flat, { recursive: true })

  /** 从某个目录出发解析 specifier，返回其包根（含 package.json 的那一层） */
  const resolvePkgDir = (specifier: string, fromDir: string): string | null => {
    try {
      let dir = path.dirname(_require.resolve(specifier, { paths: [fromDir] }))
      while (!fs.existsSync(path.join(dir, 'package.json'))) {
        const parent = path.dirname(dir)
        if (parent === dir) return null
        dir = parent
      }
      return dir
    } catch {
      return null
    }
  }

  // BFS：从 compiler-sfc 出发，把每个包连同它的 dependencies 一起搬进 fixture
  const seen = new Set<string>()
  const queue: Array<{ name: string; fromDir: string }> = [
    { name: '@vue/compiler-sfc', fromDir: repoRoot },
  ]
  while (queue.length) {
    const { name, fromDir } = queue.shift()!
    if (seen.has(name)) continue
    seen.add(name)

    const pkgDir = resolvePkgDir(name, fromDir)
    if (!pkgDir) continue
    // 搬到 fixture 的 node_modules 下（保持 @scope/name 结构）
    const dest = path.join(flat, name)
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.cpSync(fs.realpathSync(pkgDir), dest, { recursive: true })
    }

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    // 依赖 + peer 依赖都带上：compiler-sfc 的 peer（@vue/compiler-core 等）多数
    // 同时也在 dependencies 里，但显式带上更稳。optional 的不强求。
    for (const dep of Object.keys({
      ...pkgJson.dependencies,
      ...pkgJson.peerDependencies,
    })) {
      queue.push({ name: dep, fromDir: pkgDir })
    }
  }

  // 自检：fixture 里的 compiler-sfc 必须能被完整加载。加载不了会让
  // resolveCompiler 掉进「装不上」分支，于是所有断言都在测另一条路 —— 那种
  // 「测试还绿着、其实什么都没测」的失败模式最难发现，所以这里直接炸掉。
  const fixtureCompilerPath = path.join(flat, '@vue', 'compiler-sfc')
  if (!fs.existsSync(fixtureCompilerPath)) {
    throw new Error('fixture 构造失败：没搬进 @vue/compiler-sfc，依赖闭包解析有问题')
  }
  try {
    _require(_require.resolve('@vue/compiler-sfc', { paths: [root] }))
  } catch (e) {
    throw new Error(
      `fixture 构造失败：@vue/compiler-sfc 无法加载（依赖闭包不完整，测试会失真）：${(e as Error).message}`
    )
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

  /**
   * 降级分支（主路径 resolve 失败、改走 await import）在健康仓库里拿到的是仓库自己
   * 那份 compiler-sfc，构造不出错配 —— 所以这里直接钉住 assertSharedCompat 的**契约**。
   *
   * 这个契约正是 CR 找出的缺陷所在：曾经的调用是
   * `assertSharedCompat(_require, root/package.json)`，而
   *   - pnpm 严格布局下 @vue/shared 没被提升到项目根，从 root 解析直接失败 →
   *     走进 assertSharedCompat 的 catch 静默返回，压根不校验；
   *   - 即便校验到，readPackageVersion(root/package.json) 读到的是**用户项目自己的
   *     版本号**，报错会给出 `pnpm add -D @vue/shared@0.0.18` 这种有害建议。
   * 现在的契约是：起点必须是 compiler-sfc 的入口路径。
   */
  describe('assertSharedCompat 的解析起点契约', () => {
    it('起点是用户项目根时：解析不到 @vue/shared，会静默跳过校验（这正是缺陷成因）', async () => {
      const { assertSharedCompat } = await import('../src/compiler')
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-back-bare-'))
      fixtureRoots.push(root)
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'some-user-project', version: '0.0.18' })
      )

      // 从项目根出发：pnpm 严格布局下 shared 没被提升，解析失败 → 静默返回、不抛
      expect(() => assertSharedCompat(_require, path.join(root, 'package.json'))).not.toThrow()
    })

    it('起点是 compiler-sfc 入口时：能解析到它依赖的 shared 并给出真实版本号', async () => {
      const { assertSharedCompat } = await import('../src/compiler')
      const compilerPath = _require.resolve('@vue/compiler-sfc', { paths: [repoRoot] })
      // 健康依赖树：不抛
      expect(() => assertSharedCompat(_require, compilerPath)).not.toThrow()

      // 造一棵「新 compiler-sfc + 旧 shared」，并断言报错里的版本号取自 compiler-sfc
      const root = makeFixture()
      writeLegacyShared(root, '3.4.21')
      const fixtureCompiler = _require.resolve('@vue/compiler-sfc', { paths: [root] })

      let message = ''
      expect(() => assertSharedCompat(_require, fixtureCompiler)).toThrow(MpBackEnvironmentError)
      try {
        assertSharedCompat(_require, fixtureCompiler)
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toContain('3.4.21')
      // 版本号来自 compiler-sfc，不是用户项目自己的版本
      expect(message).not.toContain('0.0.18')
    })
  })

  /**
   * 降级分支必须**传入 compiler-sfc 的真实入口**作为校验起点，而不是用户项目根。
   *
   * 这条直接钉住实参：降级分支在健康仓库里拿到的是仓库自己那份 compiler-sfc，
   * 构造不出错配，纯行为断言测不到「实参传错」这个缺陷（CR 报的就是它）。
   * 做法是把 fixture 做成「primary 打不到、但 root 下有个缺 genCacheKey 的 shared」，
   * 只有起点传错（传 root）时才会被这个假 shared 影响 —— 传对了就完全不受它干扰。
   */
  it('降级分支：校验起点是 compiler-sfc 入口，不会被 root 下的假 shared 干扰', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-back-bare-'))
    fixtureRoots.push(root)
    // 冒充用户项目：root 下放一个 package.json + 一个缺 genCacheKey 的 @vue/shared。
    // 若实现传的是 root，就会解析到这个假 shared 并误报；传 compiler-sfc 入口则不会。
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'some-user-project', version: '0.0.18' })
    )
    const fakeShared = path.join(root, 'node_modules', '@vue', 'shared')
    fs.mkdirSync(fakeShared, { recursive: true })
    fs.writeFileSync(
      path.join(fakeShared, 'package.json'),
      JSON.stringify({ name: '@vue/shared', version: '3.4.21', main: 'index.js' })
    )
    fs.writeFileSync(path.join(fakeShared, 'index.js'), 'module.exports = {}\n')

    const resolveCompiler = await loadResolveCompiler('fallback')
    // 仓库依赖健康：即便 root 下摆了个缺 genCacheKey 的假 shared，
    // 也不该被它干扰 —— 因为校验起点是 compiler-sfc 自己的入口。
    const compiler = await resolveCompiler(root)
    expect(typeof compiler.parse).toBe('function')
  })
})
