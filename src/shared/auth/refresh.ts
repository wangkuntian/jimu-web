import { API_BASE_URL } from '../api/config'
import type { TokenPair } from '../api/types'
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

  const body = (await response.json()) as RefreshEnvelope
  if (body.code !== 0 || body.data === undefined) {
    clearSession()
    return null
  }

  saveSession(body.data)
  return body.data.access_token
}
