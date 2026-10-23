import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import HubView from '../../src/features/hub/views/HubView.vue'
import type { Identity } from '../../src/shared/api/types'
import { rememberSurface } from '../../src/shared/auth/surfaces'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'

const workspaceIdentity: Identity = {
  user: {
    id: 11,
    username: 'newcomer',
    status: 1,
    tenant_id: 1,
    created_at: '2026-10-19T00:00:00Z',
  },
  roles: [],
  permissions: [],
}

const adminIdentity: Identity = {
  ...workspaceIdentity,
  user: { ...workspaceIdentity.user, username: 'admin' },
  roles: ['超级管理员'],
  permissions: [{ resource: '/api/v1/users', action: 'GET' }],
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hub', component: HubView },
      { path: '/workspace', component: { template: '<div>workspace</div>' } },
      { path: '/admin', component: { template: '<div>admin</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountHub() {
  const router = createTestRouter()
  await router.push('/hub')
  await router.isReady()
  const wrapper = mount(HubView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return { router, wrapper }
}

describe('HubView', () => {
  beforeEach(() => {
    clearIdentity()
    localStorage.clear()
  })

  it('sends a workspace-only user directly to the user workspace', async () => {
    saveIdentity(workspaceIdentity)
    const { router } = await mountHub()

    expect(router.currentRoute.value.path).toBe('/workspace')
  })

  it('shows both workspace choices to an administrator on first visit', async () => {
    saveIdentity(adminIdentity)
    const { router, wrapper } = await mountHub()

    expect(router.currentRoute.value.path).toBe('/hub')
    expect(wrapper.find('[data-test="hub-workspace"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="hub-admin"]').exists()).toBe(true)
  })

  it('restores the last available surface for an administrator', async () => {
    saveIdentity(adminIdentity)
    rememberSurface('workspace')
    const { router } = await mountHub()

    expect(router.currentRoute.value.path).toBe('/workspace')
  })

  it('remembers a chosen surface', async () => {
    saveIdentity(adminIdentity)
    const { router, wrapper } = await mountHub()

    await wrapper.find('[data-test="hub-admin"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/admin')
    expect(localStorage.getItem('jimu.last_surface')).toBe('admin')
  })
})
