import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const spec = `${pkg.name}@${pkg.version}`

try {
  const { stdout } = await execFileAsync('npm', ['view', spec, 'version', '--json'])
  const publishedVersion = JSON.parse(stdout)

  if (publishedVersion) {
    console.error(`[check-publish] ${spec} already exists on npm.`)
    console.error('[check-publish] Run `pnpm run version` or add a changeset before publishing.')
    process.exit(1)
  }
} catch (error) {
  const stderr = String(error.stderr ?? '')
  if (stderr.includes('E404')) {
    console.log(`[check-publish] ${spec} is not published yet.`)
    process.exit(0)
  }

  console.error(`[check-publish] Failed to check ${spec} on npm.`)
  if (stderr) console.error(stderr.trim())
  process.exit(1)
}
