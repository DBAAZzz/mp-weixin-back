import path from 'path'
import fs from 'fs'
import JSON5 from 'json5'
import { red, white, green } from 'kolorist'
import type { ContextConfig, PagesJson } from './types'
import { transformVueFile } from './transform'

export class PageContext {
  private logPreText = '[mp-weixin-back] : '
  readonly config: ContextConfig
  pages: string[] = []
  /** pages.json 的绝对路径；找不到时为 null（此时禁用页面级过滤） */
  readonly pagesJsonPath: string | null
  /** 页面源码目录相对 root 的前缀：CLI 项目为 'src'，HBuilderX 项目为 '' */
  private sourceBase = 'src'

  log = {
    info: (text: string) => {
      console.log(white(this.logPreText + text))
    },
    error: (text: string) => {
      console.log(red(this.logPreText + text))
    },
    debugLog: (text: string) => {
      if (this.config.mode === 'development' && this.config.debug) {
        console.log(green(this.logPreText + text))
      }
    },
  }

  constructor(config: ContextConfig) {
    this.config = config
    this.pagesJsonPath = this.resolvePagesJsonPath()
  }

  /** 依次探测 src/pages.json（CLI 项目）和 pages.json（HBuilderX 项目） */
  private resolvePagesJsonPath(): string | null {
    for (const base of ['src', '']) {
      const candidate = path.join(this.config.root, base, 'pages.json')
      if (fs.existsSync(candidate)) {
        this.sourceBase = base
        return candidate
      }
    }
    return null
  }

  get hasPages(): boolean {
    return this.pagesJsonPath !== null
  }

  isPagesJson(file: string): boolean {
    return this.pagesJsonPath !== null && path.normalize(file) === path.normalize(this.pagesJsonPath)
  }

  /** 读取并解析 pages.json；dev 下 pages.json 变更时会被重新调用 */
  async loadPages(): Promise<void> {
    if (!this.pagesJsonPath) {
      this.log.debugLog('未找到 src/pages.json 或 pages.json，禁用页面级过滤（所有使用 helper 的 .vue 文件都会被处理）')
      return
    }
    try {
      const content = await fs.promises.readFile(this.pagesJsonPath, 'utf-8')
      const pagesContent = JSON5.parse(content) as PagesJson
      const next: string[] = []
      for (const page of pagesContent.pages ?? []) {
        next.push(page.path)
      }
      const subpackages = [...(pagesContent.subpackages ?? []), ...(pagesContent.subPackages ?? [])]
      for (const sub of subpackages) {
        for (const page of sub.pages ?? []) {
          next.push(`${sub.root}/${page.path}`.replace('//', '/'))
        }
      }
      this.pages = next
      this.log.debugLog(`已加载 ${next.length} 个页面（${this.pagesJsonPath}）`)
    } catch (error: unknown) {
      this.log.error(
        `Failed to read pages.json. Make sure it is valid JSON/JSON5.\n` +
          `  Path checked: ${this.pagesJsonPath}\n` +
          `  Docs: https://github.com/DBAAZzz/mp-weixin-back#%EF%B8%8F-vite-配置`
      )
      this.log.debugLog(String(error))
    }
  }

  /** 获取指定 id 对应的页面路径；不是已注册页面（或无 pages.json）时返回 null */
  getPageById(id: string): string | null {
    if (!this.hasPages) return null
    const filename = id.split('?')[0]
    const rel = path
      .relative(path.join(this.config.root, this.sourceBase), filename)
      .split(path.sep)
      .join('/')
    if (rel.startsWith('..')) return null
    const pagePath = rel.replace(/\.vue$/, '')
    return this.pages.includes(pagePath) ? pagePath : null
  }

  async transform(code: string, id: string) {
    return await transformVueFile(this, code, id)
  }
}
