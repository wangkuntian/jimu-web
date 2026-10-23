import { describe, expect, it } from 'vitest'

import router from '../../src/app/router'

describe('application routes', () => {
  it.each([
    ['/portal', '/hub'],
    ['/platform/tenants', '/admin/tenants'],
    ['/account/security', '/workspace/account/security'],
  ])('redirects legacy route %s to %s', (legacy, target) => {
    expect(router.getRoutes().find((record) => record.path === legacy)?.redirect).toBe(target)
  })

  it('exposes the user workspace and admin console route trees', () => {
    expect(router.resolve('/workspace').name).toBe('workspace')
    expect(router.resolve('/workspace/account/security').name).toBe('workspace-account-security')
    expect(router.resolve('/admin').name).toBe('admin-home')
    expect(router.resolve('/admin/users').name).toBe('admin-users')
    expect(router.resolve('/admin/tenants').name).toBe('admin-tenants')
    expect(router.resolve('/admin/account/security').name).toBe('admin-account-security')
  })

  it('marks the admin tree as permission-gated', () => {
    expect(router.resolve('/admin/users').meta.requiresAdmin).toBe(true)
  })
})
