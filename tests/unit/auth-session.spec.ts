import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearDeviceToken,
  clearSession,
  getAccessToken,
  getDeviceToken,
  getRefreshToken,
  hasSession,
  isAccessTokenExpiring,
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
})
