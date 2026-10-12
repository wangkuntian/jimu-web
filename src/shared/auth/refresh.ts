import { API_BASE_URL } from '../api/config'
import type { TokenPair } from '../api/types'
import { ErrorCode } from '../api/unwrap'
import { clearSession, getRefreshToken, saveSession } from './session'

interface RefreshEnvelope {
  code?: number | undefined
  data?: TokenPair | undefined
}

/** 进行中的刷新；并发调用共享它，避免刷新风暴与令牌互相覆盖。 */
let inflight: Promise<string | null> | null = null

/**
 * 刷新访问令牌。
 *
 * 这里刻意使用裸 `fetch` 而不是 openapi-fetch 的 client：刷新请求本身
 * 不能经过 401 重试中间件，否则会递归。
 */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (refreshToken === null) {
    return null
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // 网络错误不清理会话：可能只是离线，refresh token 仍然有效。
    return null
  }

  if (!response.ok) {
    clearSession()
    return null
  }

  let body: RefreshEnvelope | null
  try {
    body = (await response.json()) as RefreshEnvelope | null
  } catch {
    // 2xx 但响应体不是合法 JSON：服务端或代理异常，不构成 refresh token 失效的证据。
    return null
  }

  // JSON 字面量 null 会通过解析但取属性即抛错，同样不是「令牌失效」的证据。
  if (body === null) {
    return null
  }

  if (body.code !== ErrorCode.ok) {
    clearSession()
    return null
  }

  // code 为 0 说明刷新已被受理，但载荷不是对象（undefined / null / 数字）时取不出令牌。
  // 这属于服务端异常，不构成「refresh token 已失效」的证据，按既有原则不清理会话。
  if (body.data === undefined || body.data === null || typeof body.data !== 'object') {
    return null
  }

  saveSession(body.data)
  return body.data.access_token
}
