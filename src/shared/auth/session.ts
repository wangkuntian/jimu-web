import type { TokenPair } from '../api/types'

const REFRESH_TOKEN_KEY = 'jimu.refresh_token'
const DEVICE_TOKEN_KEY = 'jimu.device_token'

/** 访问令牌只驻留内存：页面刷新后靠 refresh token 恢复，不落盘。 */
let accessToken: string | null = null
/** 访问令牌的绝对到期时间（毫秒时间戳）。 */
let expiresAt = 0

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY)
}

/** 是否具备可恢复的会话。只判断 refresh token 是否存在，不代表访问令牌仍然有效。 */
export function hasSession(): boolean {
  return getRefreshToken() !== null
}

/** 访问令牌是否将在 withinMs 毫秒内到期。 */
export function isAccessTokenExpiring(withinMs = 60_000): boolean {
  return accessToken !== null && Date.now() >= expiresAt - withinMs
}

export function saveSession(tokens: TokenPair): void {
  accessToken = tokens.access_token
  expiresAt = Date.now() + tokens.expires_in * 1000
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  if (tokens.device_token !== undefined && tokens.device_token !== '') {
    localStorage.setItem(DEVICE_TOKEN_KEY, tokens.device_token)
  }
}

/**
 * 清理会话。
 *
 * 设备令牌代表「记住此设备」，跨登出保留；只有全设备登出（logout-all）时才用
 * clearDeviceToken 一并清除，因为后端此时已吊销全部可信设备。
 */
export function clearSession(): void {
  accessToken = null
  expiresAt = 0
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
}
