import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '../../src/App.vue'

describe('Jimu Portal shell', () => {
  it('shows the product name and workspace entry points', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.text()).toContain('Jimu Portal')
    expect(wrapper.text()).toContain('平台工作区')
    expect(wrapper.text()).toContain('业务工作区')
  })
})
