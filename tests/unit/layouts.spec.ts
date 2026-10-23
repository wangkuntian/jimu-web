import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AuthLayout from '../../src/layouts/AuthLayout.vue'
import PortalLayout from '../../src/layouts/PortalLayout.vue'
import UserLayout from '../../src/layouts/UserLayout.vue'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/admin',
      component: { template: '<div />' },
      meta: { navLabel: '工作概览' },
    },
    { path: '/admin/users', component: { template: '<div />' } },
    { path: '/admin/tenants', component: { template: '<div />' } },
    { path: '/admin/account/security', component: { template: '<div />' } },
    {
      path: '/workspace',
      component: { template: '<div />' },
      meta: { navLabel: '工作空间' },
    },
    { path: '/workspace/account/security', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ],
})

describe('layouts', () => {
  afterEach(() => {
    clearIdentity()
  })

  it('AuthLayout renders the product brand and shared form shell', () => {
    const wrapper = mount(AuthLayout, {
      props: {
        panelTitle: '欢迎回来',
        panelDescription: '登录你的 Jimu Hub 账号。',
      },
      slots: { default: '<p>表单</p>' },
    })

    expect(wrapper.find('.auth-shell').exists()).toBe(true)
    expect(wrapper.find('.brand-mark').exists()).toBe(true)
    expect(wrapper.find('.brand-name').text()).toBe('Jimu Hub')
    expect(wrapper.find('h1').text()).toBe('欢迎回来')
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.find('.auth-context-description').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('统一访问入口')
    expect(wrapper.text()).not.toContain('ACCESS ENTRY')
    expect(wrapper.text()).toContain('表单')
  })

  it('PortalLayout renders the admin navigation, account menu trigger, and its slot', async () => {
    saveIdentity({
      user: {
        id: 1,
        username: 'admin',
        status: 1,
        tenant_id: 1,
        created_at: '2026-10-19T00:00:00Z',
      },
      roles: ['超级管理员'],
      permissions: [
        { resource: '/api/v1/users', action: 'GET' },
        { resource: '/api/v1/tenants', action: 'GET' },
      ],
    })
    await router.push('/admin')
    await router.isReady()

    const wrapper = mount(PortalLayout, {
      slots: { default: '<p>内容</p>' },
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Jimu Hub')
    expect(wrapper.text()).toContain('工作概览')
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('租户管理')
    expect(wrapper.text()).toContain('账号安全')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).not.toContain('超级管理员')
    expect(wrapper.text()).not.toContain('未分配角色')
    expect(wrapper.text()).toContain('内容')
    expect(wrapper.find('.el-container').exists()).toBe(true)
    expect(wrapper.find('.el-aside').exists()).toBe(true)
    expect(wrapper.find('.el-header').exists()).toBe(true)
    expect(wrapper.find('.el-main').exists()).toBe(true)
    expect(wrapper.find('.app-sidebar').exists()).toBe(true)
    expect(wrapper.find('.sidebar-menu').exists()).toBe(true)
    expect(wrapper.find('.el-menu').exists()).toBe(true)
    expect(wrapper.find('.sidebar-toggle').exists()).toBe(true)
    expect(wrapper.find('.sidebar-toggle').attributes('aria-label')).toBe('收起导航')
    expect(wrapper.find('.topbar-context').text()).toBe('工作概览')
    expect(wrapper.find('.topbar-current').text()).toBe('工作概览')
    expect(wrapper.find('.primary-nav').exists()).toBe(false)
    expect(wrapper.find('.topbar-user').exists()).toBe(false)
    expect(wrapper.find('.topbar-actions').exists()).toBe(false)
    expect(wrapper.find('.account-trigger').exists()).toBe(true)
    expect(wrapper.find('.el-avatar').exists()).toBe(true)
    expect(wrapper.find('.sidebar-toggle').classes()).toContain('el-button')
    expect(wrapper.find('.sidebar-logout').exists()).toBe(false)
    expect(wrapper.find('.skip-link').attributes('href')).toBe('#main-content')
  })

  it('UserLayout renders the workspace navigation and account menu trigger', async () => {
    saveIdentity({
      user: {
        id: 11,
        username: 'newcomer',
        status: 1,
        tenant_id: 1,
        created_at: '2026-10-19T00:00:00Z',
      },
      roles: [],
      permissions: [],
    })
    await router.push('/workspace')

    const wrapper = mount(UserLayout, {
      slots: { default: '<p>工作区内容</p>' },
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.find('.app-sidebar').exists()).toBe(true)
    expect(wrapper.text()).toContain('Jimu Hub')
    expect(wrapper.text()).toContain('工作空间')
    expect(wrapper.text()).toContain('账号安全')
    expect(wrapper.text()).toContain('newcomer')
    expect(wrapper.text()).toContain('工作区内容')
    expect(wrapper.find('.account-trigger').exists()).toBe(true)
    expect(wrapper.find('.topbar-user').exists()).toBe(false)
    expect(wrapper.find('.sidebar-logout').exists()).toBe(false)
  })
})
