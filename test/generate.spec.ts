import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
// @ts-ignore
import IndexSetup from './data/index-setup.vue'
// @ts-ignore
import IndexDefault from './data/index-default.vue'

describe('generate page-container components', () => {
  it('setup compisitionAPI', async () => {
    const wrapper = mount(IndexSetup)
    await wrapper.vm.$nextTick()

    const pageContainerRef = wrapper.find('page-container')
    expect(pageContainerRef.exists()).toBe(true)
    expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
    expect(wrapper.vm.onBeforeLeave()).toBe(true)
  })

  it('default optionsAPI', async () => {
    const wrapper = mount(IndexDefault)
    await wrapper.vm.$nextTick()
    const pageContainerRef = wrapper.find('page-container')
    expect(pageContainerRef.exists()).toBe(true)
    // @ts-ignore
    expect(wrapper.vm.__MP_BACK_SHOW_PAGE_CONTAINER__).toBe(true)
    // @ts-ignore
    expect(wrapper.vm.__MP_BACK_FREQUENCY__).toBe(1)
    // @ts-ignore
    expect(wrapper.vm.onBeforeLeave()).toBe(true)
  })
})
