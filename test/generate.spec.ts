import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
// @ts-ignore
import Index from './data/index.vue'

describe('generate page-container components', () => {
  it('page has template tag', async () => {
    const wrapper = mount(Index)
    await wrapper.vm.$nextTick()

    const pageContainerRef = wrapper.find('page-container')
    expect(pageContainerRef.exists()).toBe(true)
  })
})
