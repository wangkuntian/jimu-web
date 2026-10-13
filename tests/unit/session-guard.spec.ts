import { beforeEach, describe, expect, it } from 'vitest'

import { resolveSessionNavigation } from '../../src/app/guards/session'
import { clearSession, saveSession } from '../../src/shared/auth/session'

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
