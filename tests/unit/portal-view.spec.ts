import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import PortalView from '../../src/views/PortalView.vue'
import type { Identity } from '../../src/shared/api/types'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'

const adminIdentity: Identity = {
  user: {
    id: 1,
    username: 'admin',
    status: 1,
    tenant_id: 1,
    created_at: '2026-10-19T00:00:00Z',
  },
  roles: ['超级管理员'],
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'POST' },
    { resource: '/api/v1/tenants/*', action: 'GET' },
    { resource: '/api/v1/tenants/*', action: 'PUT' },
    { resource: '/api/v1/tenants/*', action: 'DELETE' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

function mountPortal() {
  return mount(PortalView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  })
}

describe('PortalView', () => {
  afterEach(() => {
    clearIdentity()
  })

  it('renders the personalized overview and tenant access for an administrator', () => {
    saveIdentity(adminIdentity)
    const wrapper = mountPortal()

    expect(wrapper.find('h1').text()).toBe('工作概览')
    expect(wrapper.text()).toContain('欢迎回来，admin')
    expect(wrapper.find('[data-test="portal-role"]').text()).toBe('超级管理员')
    expect(wrapper.find('[data-test="portal-permission-count"]').text()).toBe('6')
    expect(wrapper.find('[data-test="portal-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="quick-tenants"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="quick-workspace"]').attributes('href')).toBe('/workspace')
    expect(wrapper.find('[data-test="quick-security"]').attributes('href')).toBe(
      '/admin/account/security',
    )
  })

  it('keeps the overview useful for a zero-role user without tenant access', () => {
    saveIdentity({ ...adminIdentity, roles: [], permissions: [] })
    const wrapper = mountPortal()

    expect(wrapper.text()).toContain('欢迎回来，admin')
    expect(wrapper.find('[data-test="portal-role"]').text()).toBe('暂未分配角色')
    expect(wrapper.find('[data-test="portal-permission-count"]').text()).toBe('0')
    expect(wrapper.find('[data-test="quick-tenants"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="quick-workspace"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="quick-security"]').exists()).toBe(true)
  })
})
