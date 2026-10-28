import { shallowRef } from 'vue'

import type { Identity, TokenPair } from '../api/types'

const REFRESH_TOKEN_KEY = 'jimu.refresh_token'
const DEVICE_TOKEN_KEY = 'jimu.device_token'

/** 访问令牌只驻留内存：页面刷新后靠 refresh token 恢复，不落盘。 */
let accessToken: string | null = null
/** 访问令牌的绝对到期时间（毫秒时间戳）。 */
let expiresAt = 0
/** 当前会话身份；内存驻留，不落盘、不进 Pinia。用 ref 让导航项能随引导完成重算。 */
const identity = shallowRef<Identity | null>(null)

/** 身份的加载状态；`'unknown'` 表示尚未加载或已被清理。 */
export type IdentityStatus = 'ok' | 'unauthenticated' | 'unavailable'
export type IdentityState = IdentityStatus | 'unknown'

const identityStatus = shallowRef<IdentityState>('unknown')

type SessionClearedHandler = () => void
const sessionClearedHandlers = new Set<SessionClearedHandler>()

/** 清理会话时同步丢弃与服务端身份绑定的缓存。 */
export function onSessionCleared(handler: SessionClearedHandler): () => void {
  sessionClearedHandlers.add(handler)
  return () => {
    sessionClearedHandlers.delete(handler)
  }
}

export function getIdentityStatus(): IdentityState {
  return identityStatus.value
}

/** 只由身份引导流程写入；`saveIdentity` / `clearIdentity` / `clearSession` 会同步维护。 */
export function setIdentityStatus(value: IdentityState): void {
  identityStatus.value = value
}

export function getIdentity(): Identity | null {
  return identity.value
}

export function saveIdentity(value: Identity): void {
  identity.value = value
  identityStatus.value = 'ok'
}

export function clearIdentity(): void {
  identity.value = null
  // 清空身份意味着「还没加载」而不是「已加载且无权限」，不能残留 'ok'。
  identityStatus.value = 'unknown'
}

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
 *
 * 主动登出已经自行导航，所以这里不通知订阅者；会话被服务端拒绝时用 expireSession。
 */
export function clearSession(): void {
  accessToken = null
  expiresAt = 0
  identity.value = null
  identityStatus.value = 'unknown'
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  for (const handler of sessionClearedHandlers) {
    handler()
  }
}

type SessionExpiredHandler = () => void

/** 会话失效订阅者；刷新被拒时逐个通知，由路由装配处用于跳转登录页。 */
const sessionExpiredHandlers = new Set<SessionExpiredHandler>()

/** 订阅「会话被服务端拒绝」事件，返回取消订阅函数。 */
export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler)
  return () => {
    sessionExpiredHandlers.delete(handler)
  }
}

/**
 * 会话被服务端拒绝（刷新失败）时清理会话并通知订阅者。
 *
 * 与 `clearSession()` 的分工：主动登出已自行导航，必须用 `clearSession()` 避免二次跳转；
 * 只有刷新失败这类「会话已失效」的路径才用本函数。
 */
export function expireSession(): void {
  clearSession()
  for (const handler of sessionExpiredHandlers) {
    handler()
  }
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
}
