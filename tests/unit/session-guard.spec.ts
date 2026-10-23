import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveGuardNavigation, resolveSessionNavigation } from '../../src/app/guards/session'
import { ensureIdentity } from '../../src/shared/auth/identity'
import {
  clearIdentity,
  clearSession,
  hasSession,
  saveIdentity,
  saveSession,
} from '../../src/shared/auth/session'

vi.mock('../../src/shared/auth/identity', () => ({ ensureIdentity: vi.fn() }))

const ensureIdentityMock = vi.mocked(ensureIdentity)
const tokens = { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 }

function route(path: string, isPublic = false) {
  return { path, fullPath: path, meta: isPublic ? { public: true } : {} }
}

describe('resolveSessionNavigation', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
  })

  it('allows public routes without a session', () => {
    expect(resolveSessionNavigation(route('/login', true))).toBe(true)
  })

  it('redirects to login and keeps the target path', () => {
    expect(resolveSessionNavigation(route('/account/security/devices'))).toEqual({
      path: '/login',
      query: { redirect: '/account/security/devices' },
    })
  })

  it('allows protected routes when a session exists', () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    expect(resolveSessionNavigation(route('/hub'))).toBe(true)
  })

  it('sends an authenticated user away from the login page', () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    expect(resolveSessionNavigation(route('/login', true))).toEqual({ path: '/hub' })
  })
})

describe('resolveGuardNavigation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearIdentity()
    ensureIdentityMock.mockReset()
  })

  it('redirects an unauthenticated visitor without loading the identity', async () => {
    await expect(
      resolveGuardNavigation({ path: '/portal', fullPath: '/portal', meta: {} }),
    ).resolves.toEqual({ path: '/login', query: { redirect: '/portal' } })
    expect(ensureIdentityMock).not.toHaveBeenCalled()
  })

  it('loads the identity before allowing a protected route', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('ok')

    await expect(
      resolveGuardNavigation({
        path: '/platform/tenants',
        fullPath: '/platform/tenants',
        meta: {},
      }),
    ).resolves.toBe(true)
    expect(ensureIdentityMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the user signed in when the identity endpoint is unavailable', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('unavailable')

    await expect(
      resolveGuardNavigation({ path: '/portal', fullPath: '/portal', meta: {} }),
    ).resolves.toBe(true)
    expect(hasSession()).toBe(true)
  })

  it('clears the session and returns to login when the session was rejected', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('unauthenticated')

    await expect(
      resolveGuardNavigation({
        path: '/platform/tenants',
        fullPath: '/platform/tenants',
        meta: {},
      }),
    ).resolves.toEqual({ path: '/login', query: { redirect: '/platform/tenants' } })
    expect(hasSession()).toBe(false)
  })

  it('sends a signed-in visitor away from the login page', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('ok')

    await expect(
      resolveGuardNavigation({ path: '/login', fullPath: '/login', meta: { public: true } }),
    ).resolves.toEqual({ path: '/hub' })
  })

  it('keeps a user without admin read permissions out of the admin surface', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('ok')
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

    await expect(
      resolveGuardNavigation({
        path: '/admin/users',
        fullPath: '/admin/users',
        meta: { requiresAdmin: true },
      }),
    ).resolves.toEqual({ path: '/workspace' })
  })

  it('allows an admin surface route with users GET permission', async () => {
    saveSession(tokens)
    ensureIdentityMock.mockResolvedValue('ok')
    saveIdentity({
      user: {
        id: 1,
        username: 'admin',
        status: 1,
        tenant_id: 1,
        created_at: '2026-10-19T00:00:00Z',
      },
      roles: [],
      permissions: [{ resource: '/api/v1/users', action: 'GET' }],
    })

    await expect(
      resolveGuardNavigation({
        path: '/admin/users',
        fullPath: '/admin/users',
        meta: { requiresAdmin: true },
      }),
    ).resolves.toBe(true)
  })
})
