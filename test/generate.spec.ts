import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexSetup from './data/index-setup.vue'
import IndexUtils from './data/index-utils.vue'
import IndexAlias from './data/index-alias.vue'
import IndexFrequency from './data/index-frequency.vue'
import IndexDefault from './data/index-default.vue'
import IndexDefaultFn from './data/index-default-fn.vue'
import IndexDefaultObject from './data/index-default-object.vue'

const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('generate page-container components', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let navigateBack: ReturnType<typeof vi.fn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    navigateBack = vi.fn()
    ;(globalThis as any).uni = { navigateBack }
  })

  afterEach(() => {
    logSpy.mockRestore()
    delete (globalThis as any).uni
  })

  describe('setup compositionAPI', () => {
    it('default case', async () => {
      const wrapper = mount(IndexSetup)
      await wrapper.vm.$nextTick()

      const pageContainerRef = wrapper.find('page-container')
      expect(pageContainerRef.exists()).toBe(true)
      expect((wrapper.vm as any).__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
      expect(typeof (wrapper.vm as any).onBeforeLeave).toBe('function')

      // 触发返回：用户回调执行 + 默认放行（navigateBack）
      ;(wrapper.vm as any).onBeforeLeave()
      expect(logSpy).toHaveBeenCalledWith('触发了手势返回！')
      expect(navigateBack).toHaveBeenCalledWith({ delta: 1 })
    })

    it('utils case', async () => {
      const wrapper = mount(IndexUtils)
      await wrapper.vm.$nextTick()

      const pageContainerRef = wrapper.find('page-container')
      expect(pageContainerRef.exists()).toBe(true)
      // per-page 配置 initialValue: false
      expect((wrapper.vm as any).__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(false)
      expect(typeof (wrapper.vm as any).onBeforeLeave).toBe('function')

      await wrapper.find('#button2').trigger('click')
      await flushTimers()

      expect(logSpy).toHaveBeenCalledWith('执行了activeMpBack')
      expect((wrapper.vm as any).__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      await wrapper.find('#button').trigger('click')
      await flushTimers()

      expect((wrapper.vm as any).__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(false)
    })

    it('alias default import', async () => {
      const wrapper = mount(IndexAlias)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('page-container').exists()).toBe(true)
      ;(wrapper.vm as any).onBeforeLeave()
      expect(logSpy).toHaveBeenCalledWith('别名回调触发')
    })

    it('frequency: 拦截 frequency 次后放行（preventDefault: true 不触发 navigateBack）', async () => {
      const wrapper = mount(IndexFrequency)
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      // 第 1 次：计数 1 < 3，重新武装（show 瞬时 false → true）
      vm.onBeforeLeave()
      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(false)
      await flushTimers()
      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      // 第 2 次：计数 2 < 3，仍重新武装
      vm.onBeforeLeave()
      await flushTimers()
      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      // 第 3 次：计数 3 < 3 不成立，不再重新武装（后续返回放行）
      vm.onBeforeLeave()
      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      expect(logSpy).toHaveBeenCalledWith('frequency 回调触发')
      // preventDefault: true → 全程不调用 navigateBack
      expect(navigateBack).not.toHaveBeenCalled()
    })
  })

  describe('optionsAPI', () => {
    it('method shorthand（onPageBack() {}）', async () => {
      const wrapper = mount(IndexDefault)
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      expect(wrapper.find('page-container').exists()).toBe(true)
      expect(vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
      expect(vm.__MP_BACK_FREQUENCY__).toBe(1)
      expect(typeof vm.onBeforeLeave).toBe('function')

      vm.onBeforeLeave()
      expect(logSpy).toHaveBeenCalledWith('触发了手势返回！')
      expect(navigateBack).toHaveBeenCalledWith({ delta: 1 })
    })

    it('function property（onPageBack: function () {}），保留已有 methods', async () => {
      const wrapper = mount(IndexDefaultFn)
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      expect(wrapper.find('page-container').exists()).toBe(true)
      expect(vm.existing()).toBe('existing')

      vm.onBeforeLeave()
      expect(vm.backCount).toBe(1)
      expect(navigateBack).toHaveBeenCalled()
    })

    it('object form（{ handler, preventDefault }）支持 per-page 配置', async () => {
      const wrapper = mount(IndexDefaultObject)
      await wrapper.vm.$nextTick()
      const vm = wrapper.vm as any

      expect(wrapper.find('page-container').exists()).toBe(true)

      vm.onBeforeLeave()
      expect(vm.backCount).toBe(1)
      // preventDefault: true → 不触发 navigateBack
      expect(navigateBack).not.toHaveBeenCalled()
    })
  })
})
