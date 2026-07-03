import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const dryRun = process.argv.includes('--dry-run')

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const spec = `${pkg.name}@${pkg.version}`

async function isPublished() {
  try {
    const { stdout } = await execFileAsync('npm', ['view', spec, 'version', '--json'])
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
await run('pnpm', ['test:run'])
await run('pnpm', ['build'])
await run('pnpm', ['check-publish'])

if (dryRun) {
  console.log('[release] Dry run completed.')
} else {
  await run('pnpm', ['publish', '--access', 'public', '--no-git-checks'])
}
