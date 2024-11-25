import path from 'path'
import fs from 'fs'
import JSON5 from 'json5'
import { red, white, green } from 'kolorist'
import { ContextConfig, PagesJson } from '../types'
import { transformVueFile } from '../utils'

export class pageContext {
  config: ContextConfig
  pages: string[] = []
  log = {
    info: (text: string) => {
      console.log(white(text))
    },
    error: (text: string) => {
      console.log(red(text))
    },
    devLog: (text: string) => {
      if (this.config.mode === 'development' && this.config.debug) {
        console.log(green(text))
      }
    },
  }

  constructor(config: ContextConfig) {
    this.config = config
  }
  getPagesJsonPath() {
    const pagesJsonPath = path.join(this.config.root, 'src/pages.json')
    return pagesJsonPath
  }
  // 获取页面配置详情
  async getPagesJsonInfo() {
    const hasPagesJson = fs.existsSync(this.getPagesJsonPath())
    if (!hasPagesJson) return
    try {
      const content = await fs.promises.readFile(this.getPagesJsonPath(), 'utf-8')
      const pagesContent = JSON5.parse(content) as PagesJson
      const { pages, subpackages } = pagesContent
      if (pages) {
        const mainPages = pages.reduce((acc: string[], current) => {
          acc.push(current.path)
          return acc
        }, [])
        this.pages.push(...mainPages)
      }
      if (subpackages) {
        for (let i = 0; i < subpackages.length; i++) {
          const element = subpackages[i]
          const root = element.root
          const subPages = element.pages.reduce((acc: string[], current) => {
            acc.push(`${root}/${current.path}`.replace('//', '/'))
            return acc
          }, [])
          this.pages.push(...subPages)
        }
      }
    } catch (error: unknown) {
      this.log.error('读取pages.json文件失败')
      this.log.devLog(String(error))
    }
  }
  // 获取指定id的page
  getPageById(id: string) {
    const path = (id.split('src/')[1] || '').replace('.vue', '')
    // 页面级别
    return this.pages.find((i) => i === path) || null
  }
  async transform(code: string, id: string) {
    const result = await transformVueFile.call(this, code, id)
    return result
  }
}
