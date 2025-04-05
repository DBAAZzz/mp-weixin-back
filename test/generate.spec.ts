import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexSetup from './data/index-setup.vue'
import IndexUtils from './data/index-utils.vue'
import IndexDefault from './data/index-default.vue'

describe('generate page-container components', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  describe('setup compositionAPI', () => {
    it('default case', async () => {
      const wrapper = mount(IndexSetup)
      await wrapper.vm.$nextTick()

      const pageContainerRef = wrapper.find('page-container')
      expect(pageContainerRef.exists()).toBe(true)
      expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
      expect(typeof wrapper.vm.onBeforeLeave).toBe('function')
    })

    it('utils case', async () => {
      const wrapper = mount(IndexUtils)
      await wrapper.vm.$nextTick()

      const pageContainerRef = wrapper.find('page-container')
      expect(pageContainerRef.exists()).toBe(true)
      expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(false)
      expect(typeof wrapper.vm.onBeforeLeave).toBe('function')

      await wrapper.find('#button2').trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(logSpy).toHaveBeenCalledWith('执行了activeMpBack')

      expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)

      await wrapper.find('#button').trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(false)
    })
  })

  describe('optionsAPI', () => {
    it('default case', async () => {
      const wrapper = mount(IndexDefault)
      await wrapper.vm.$nextTick()

      const pageContainerRef = wrapper.find('page-container')
      expect(pageContainerRef.exists()).toBe(true)
      expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
      expect(wrapper.vm.__MP_BACK_FREQUENCY__).toBe(1)
      expect(wrapper.vm.onBeforeLeave()).toBe(true)
    })
  })
})
