import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AuthLayout from '../../src/layouts/AuthLayout.vue'
import PortalLayout from '../../src/layouts/PortalLayout.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

describe('layouts', () => {
  it('AuthLayout renders its slot inside a centered card', () => {
    const wrapper = mount(AuthLayout, { slots: { default: '<p>表单</p>' } })

    expect(wrapper.find('.auth-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('表单')
  })

  it('PortalLayout renders navigation and its slot', () => {
    const wrapper = mount(PortalLayout, {
      slots: { default: '<p>内容</p>' },
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Jimu Portal')
    expect(wrapper.text()).toContain('平台工作区')
    expect(wrapper.text()).toContain('业务工作区')
    expect(wrapper.text()).toContain('账号安全')
    expect(wrapper.text()).toContain('内容')
  })
})
