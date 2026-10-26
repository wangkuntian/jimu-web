import { beforeEach, describe, expect, it } from 'vitest'

import {
  canAccessAdminSurface,
  canAccessWorkspace,
  readLastSurface,
  rememberSurface,
  rememberSurfaceForPath,
} from '../../src/shared/auth/surfaces'
import type { Identity } from '../../src/shared/api/types'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'

function identityWith(permissions: Identity['permissions']): Identity {
  return {
    user: {
      id: 1,
      username: 'admin',
      status: 1,
      tenant_id: 1,
      created_at: '2026-10-19T00:00:00Z',
    },
    roles: [],
    permissions,
  }
}

describe('workspace surfaces', () => {
  beforeEach(() => {
    clearIdentity()
    localStorage.clear()
  })

  it('always makes the user workspace available to an authenticated user', () => {
    expect(canAccessWorkspace()).toBe(true)
  })

  it('denies the admin surface before the identity is loaded', () => {
    expect(canAccessAdminSurface()).toBe(false)
  })

  it.each(['/api/v1/users', '/api/v1/roles', '/api/v1/tenants'])(
    'grants the admin surface from GET %s',
    (resource) => {
      saveIdentity(identityWith([{ resource, action: 'GET' }]))

      expect(canAccessAdminSurface()).toBe(true)
    },
  )

  it('does not grant the admin surface from a write permission alone', () => {
    saveIdentity(identityWith([{ resource: '/api/v1/users', action: 'POST' }]))

    expect(canAccessAdminSurface()).toBe(false)
  })

  it('persists the last surface and ignores unknown stored values', () => {
    expect(readLastSurface()).toBeNull()

    rememberSurface('admin')
    expect(readLastSurface()).toBe('admin')

    rememberSurface('workspace')
    expect(readLastSurface()).toBe('workspace')

    localStorage.setItem('jimu.last_surface', 'unknown')
    expect(readLastSurface()).toBeNull()
  })

  it('remembers the surface reached by a deep link or account-menu switch', () => {
    rememberSurfaceForPath('/admin/users')
    expect(readLastSurface()).toBe('admin')

    rememberSurfaceForPath('/workspace/account/security')
    expect(readLastSurface()).toBe('workspace')

    localStorage.clear()
    rememberSurfaceForPath('/hub')
    expect(readLastSurface()).toBeNull()
  })
})
