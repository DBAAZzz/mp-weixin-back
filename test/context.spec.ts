import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PageContext } from '../src/context'
import type { ContextConfig } from '../src/types'

const baseConfig = (root: string): ContextConfig => ({
  initialValue: true,
  preventDefault: false,
  frequency: 1,
  debug: false,
  mode: 'test',
  root,
})

const PAGES_JSON = JSON.stringify({
  pages: [{ path: 'pages/index/index' }, { path: 'pages/detail/detail' }],
  // 大小写两种写法都要支持
  subPackages: [{ root: 'packageA', pages: [{ path: 'list/list' }] }],
  subpackages: [{ root: 'packageB/', pages: [{ path: 'form/form' }] }],
})

describe('PageContext', () => {
  describe('CLI 项目（src/pages.json）', () => {
    let root: string

    beforeAll(async () => {
      root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mp-back-src-'))
      await fs.promises.mkdir(path.join(root, 'src'))
      await fs.promises.writeFile(path.join(root, 'src/pages.json'), PAGES_JSON)
    })

    afterAll(() => fs.promises.rm(root, { recursive: true, force: true }))

    it('解析主包与分包页面（含 subPackages/subpackages 两种写法）', async () => {
      const context = new PageContext(baseConfig(root))
      await context.loadPages()
      expect(context.hasPages).toBe(true)
      expect([...context.pages].sort()).toEqual(
        ['pages/index/index', 'pages/detail/detail', 'packageA/list/list', 'packageB/form/form'].sort()
      )
    })

    it('getPageById：页面命中、组件不命中、带 query 的 id 可解析', async () => {
      const context = new PageContext(baseConfig(root))
      await context.loadPages()
      expect(context.getPageById(path.join(root, 'src/pages/index/index.vue'))).toBe(
        'pages/index/index'
      )
      expect(context.getPageById(path.join(root, 'src/pages/index/index.vue') + '?vue&type=script')).toBe(
        'pages/index/index'
      )
      expect(context.getPageById(path.join(root, 'src/components/foo.vue'))).toBeNull()
      expect(context.getPageById('/elsewhere/src/pages/index/index.vue')).toBeNull()
    })
  })

  describe('HBuilderX 项目（根目录 pages.json）', () => {
    let root: string

    beforeAll(async () => {
      // 路径中故意包含 'src'，验证不再依赖 split('src/')
      root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mp-back-srcapp-'))
      await fs.promises.writeFile(
        path.join(root, 'pages.json'),
        JSON.stringify({ pages: [{ path: 'pages/index/index' }] })
      )
    })

    afterAll(() => fs.promises.rm(root, { recursive: true, force: true }))

    it('从项目根目录发现 pages.json 并解析页面', async () => {
      const context = new PageContext(baseConfig(root))
      await context.loadPages()
      expect(context.hasPages).toBe(true)
      expect(context.getPageById(path.join(root, 'pages/index/index.vue'))).toBe('pages/index/index')
    })
  })

  describe('无 pages.json', () => {
    it('禁用页面级过滤（hasPages 为 false）', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mp-back-none-'))
      try {
        const context = new PageContext(baseConfig(root))
        await context.loadPages()
        expect(context.hasPages).toBe(false)
        expect(context.getPageById(path.join(root, 'src/pages/index/index.vue'))).toBeNull()
      } finally {
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })
})
