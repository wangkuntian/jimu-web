import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import PortalLayout from '../../src/layouts/PortalLayout.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

describe('Jimu Portal shell', () => {
  it('shows the product name and workspace entry points', () => {
    const wrapper = mount(PortalLayout, {
      global: {
        plugins: [ElementPlus, router],
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
