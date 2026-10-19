import { beforeEach, describe, expect, it } from 'vitest'

import { hasPermission, keyMatch } from '../../src/shared/auth/permission'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'
import type { Identity } from '../../src/shared/api/types'

const identity = (permissions: Identity['permissions']): Identity => ({
  user: { id: 1, username: 'admin', status: 1, tenant_id: 1, created_at: '2026-10-19T00:00:00Z' },
  roles: ['超级管理员'],
  permissions,
})

describe('keyMatch', () => {
  // 用例表逐条取自后端 Casbin KeyMatch 语义（docs/superpowers/specs/2026-10-13-v0.4.0-... §6.2）
  it.each([
    ['/api/v1/admin/users/7/roles', '/api/v1/admin/*', true],
    ['/api/v1/users', '/api/v1/user*', true],
    ['/api/v1/tenants', '/api/v1/tenants/*', false],
    ['/api/v1/tenants', '/api/v1/tenants', true],
    ['/api/v1/tenants/7', '/api/v1/tenants/*', true],
    ['/api/v1/tenants/7/plan', '/api/v1/tenants/*', true],
    ['/api/v1/tenants', '/api/v1/tenant-plans', false],
  ])('keyMatch(%s, %s) === %s', (requestPath, grantedResource, expected) => {
    expect(keyMatch(requestPath, grantedResource)).toBe(expected)
  })

  it('does not swap its arguments', () => {
    // 交换后 keyMatch("/api/v1/tenants/*", "/api/v1/tenants") 会退化成精确比较 ⇒ false
    expect(keyMatch('/api/v1/tenants/*', '/api/v1/tenants')).toBe(false)
  })
})

describe('hasPermission', () => {
  beforeEach(() => {
    clearIdentity()
  })

  it('is false before the identity is loaded', () => {
    expect(hasPermission('/api/v1/tenants', 'GET')).toBe(false)
  })

  it('matches an exact resource and action', () => {
    saveIdentity(identity([{ resource: '/api/v1/tenants', action: 'GET' }]))
    expect(hasPermission('/api/v1/tenants', 'GET')).toBe(true)
    expect(hasPermission('/api/v1/tenants', 'POST')).toBe(false)
  })

  it('requires a wildcard grant for a per-row path', () => {
    saveIdentity(identity([{ resource: '/api/v1/tenants', action: 'GET' }]))
    expect(hasPermission('/api/v1/tenants/7', 'GET')).toBe(false)

    saveIdentity(identity([{ resource: '/api/v1/tenants/*', action: 'PUT' }]))
    expect(hasPermission('/api/v1/tenants/7', 'PUT')).toBe(true)
    expect(hasPermission('/api/v1/tenants/7/plan', 'PUT')).toBe(true)
    expect(hasPermission('/api/v1/tenants/7', 'DELETE')).toBe(false)
  })

  it('lets an action wildcard through', () => {
    saveIdentity(identity([{ resource: '/api/v1/tenants', action: '*' }]))
    expect(hasPermission('/api/v1/tenants', 'GET')).toBe(true)
    expect(hasPermission('/api/v1/tenants', 'DELETE')).toBe(true)
  })
})
