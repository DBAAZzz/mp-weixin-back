import path from 'path'
import fs from 'fs'
import { ContextConfig, PagesJson } from '../types'
import { transformVueFile } from '../utils'

export class pageContext {
  config: ContextConfig
  pages: string[] = []

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
      const pagesContent = JSON.parse(content) as PagesJson
      const { pages, subpackages } = pagesContent
      if (pages) {
        const mainPages = pages.reduce((acc: string[], current) => {
          acc.push(current.path)
          return acc
        }, [])
        this.pages.push(...mainPages)
      }
      if (subpackages) {
        const root = subpackages.root
        const subPages = subpackages.pages.reduce((acc: string[], current) => {
          acc.push(`${root}/${current.path}`.replace('//', '/'))
          return acc
        }, [])
        this.pages.push(...subPages)
      }
    } catch (error) {
      throw new Error('请正确配置项目的pages.json文件')
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
