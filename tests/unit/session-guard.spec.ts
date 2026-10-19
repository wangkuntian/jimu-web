import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveGuardNavigation, resolveSessionNavigation } from '../../src/app/guards/session'
import { ensureIdentity } from '../../src/shared/auth/identity'
import { clearIdentity, clearSession, hasSession, saveSession } from '../../src/shared/auth/session'

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

    expect(resolveSessionNavigation(route('/portal'))).toBe(true)
  })

  it('sends an authenticated user away from the login page', () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    expect(resolveSessionNavigation(route('/login', true))).toEqual({ path: '/portal' })
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
    ).resolves.toEqual({ path: '/portal' })
  })
})
