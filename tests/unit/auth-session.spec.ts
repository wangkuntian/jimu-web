import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearDeviceToken,
  clearSession,
  expireSession,
  getAccessToken,
  getDeviceToken,
  getRefreshToken,
  hasSession,
  isAccessTokenExpiring,
  onSessionExpired,
  saveSession,
} from '../../src/shared/auth/session'

const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 1800,
}

describe('auth session', () => {
  beforeEach(() => {
    clearSession()
    clearDeviceToken()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('keeps the access token in memory and the refresh token in sessionStorage', () => {
    saveSession(tokens)

    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem('jimu.refresh_token')).toBeNull()
    expect(sessionStorage.getItem('jimu.access_token')).toBeNull()
  })

  it('keeps the device token across clearSession', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    clearSession()

    expect(getDeviceToken()).toBe('device-1')
    expect(getRefreshToken()).toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('drops the device token only when explicitly cleared', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    clearDeviceToken()

    expect(getDeviceToken()).toBeNull()
  })

  it('does not overwrite an existing device token when the response omits it', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    saveSession(tokens)

    expect(getDeviceToken()).toBe('device-1')
  })

  it('reports the access token as expiring inside the safety window', () => {
    expect(isAccessTokenExpiring()).toBe(false)

    saveSession({ ...tokens, expires_in: 30 })
    expect(isAccessTokenExpiring()).toBe(true)

    saveSession({ ...tokens, expires_in: 3600 })
    expect(isAccessTokenExpiring()).toBe(false)
  })

  it('notifies expiry subscribers only when the session was rejected', () => {
    const handler = vi.fn()
    const unsubscribe = onSessionExpired(handler)

    try {
      // 主动登出：只清会话，不通知，避免与 PortalLayout 自己的跳转重复。
      saveSession(tokens)
      clearSession()
      expect(handler).not.toHaveBeenCalled()

      // 刷新被拒：清理并通知一次。
      saveSession(tokens)
      expireSession()
      expect(handler).toHaveBeenCalledTimes(1)
      expect(hasSession()).toBe(false)

      // 退订后不再收到通知。
      unsubscribe()
      saveSession(tokens)
      expireSession()
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribe()
    }
  })
})
