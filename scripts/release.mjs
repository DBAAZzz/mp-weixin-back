import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const dryRun = process.argv.includes('--dry-run')
// 显式指定：本机的 npm 可能配了镜像（npmmirror），镜像既不能发布，也可能还没同步到最新版本
const REGISTRY = 'https://registry.npmjs.org/'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const spec = `${pkg.name}@${pkg.version}`

async function isPublished() {
  try {
    const { stdout } = await execFileAsync('npm', ['view', spec, 'version', '--json', '--registry', REGISTRY])
    return Boolean(JSON.parse(stdout))
  } catch (error) {
    const stderr = String(error.stderr ?? '')
    if (stderr.includes('E404')) return false
    console.error(`[release] Failed to check ${spec} on npm.`)
    if (stderr) console.error(stderr.trim())
    process.exit(1)
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

if (await isPublished()) {
  console.log(`[release] ${spec} already exists on npm. Skip publish.`)
  process.exit(0)
}

console.log(`[release] ${spec} is not published yet. Running release checks.`)

await run('pnpm', ['typecheck'])
// 用 test:all 而不是 test:run：example/web 那套走真实 Vite 管线，是「插件确实
// 被挂进管线、页面门控按预期放行/拦截」的唯一自动化证据。发布门禁若只跑根套件，
// example/web 挂了照样发得出去 —— 与 CI 的通过标准不一致。
await run('pnpm', ['test:all'])
await run('pnpm', ['build'])
await run('pnpm', ['check-publish'])

if (dryRun) {
  console.log('[release] Dry run completed.')
} else {
  // 用 npm 而不是 pnpm 发布：CI 里的 Trusted Publishing 由 npm CLI 完成 OIDC 认证，
  // pnpm 10 是否支持说法不一。这个包没有 workspace 依赖，两者发出的内容相同
  await run('npm', ['publish', '--access', 'public', '--registry', REGISTRY])
}
