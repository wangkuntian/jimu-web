import { API_BASE_URL } from '../api/config'
import type { TokenPair } from '../api/types'
import { ErrorCode } from '../api/unwrap'
import { expireSession, getRefreshToken, saveSession } from './session'

interface RefreshEnvelope {
  code?: number | undefined
  data?: unknown
}

/** 进行中的刷新；并发调用共享它，避免刷新风暴与令牌互相覆盖。 */
let inflight: Promise<string | null> | null = null

/**
 * 刷新访问令牌。
 *
 * 这里刻意使用裸 `fetch` 而不是 openapi-fetch 的 client：刷新请求本身
 * 不能经过 401 重试中间件，否则会递归。
 *
 * `doRefresh` 覆盖了预期内的失败；这里的 catch 是最后一道兜底：`getRefreshToken`
 * 与 `saveSession` 在 `doRefresh` 的 try 之外，`sessionStorage` 抛 SecurityError /
 * QuotaExceededError 时也必须按契约 resolve null 而不是 reject。
 */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh()
    .catch(() => null)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * 载荷必须是真正含令牌字符串的对象。
 *
 * 只判断 `typeof data === 'object'` 会放进 `{}` 与 `[]`：后端 `response.OK(c, gin.H{})`
 * 序列化出来正是 `{"code":0,"data":{}}`，saveSession 会写入 `undefined` 访问令牌，
 * 并把刷新令牌覆盖成字符串 `"undefined"`——它非 null，`hasSession()` 因此误判为已登录。
 */
function isTokenPair(value: unknown): value is TokenPair {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Record<string, unknown>
  return typeof payload.access_token === 'string' && typeof payload.refresh_token === 'string'
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
    expireSession()
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
    expireSession()
    return null
  }

  const data: unknown = body.data

  // code 为 0 说明刷新已被受理，但载荷不是对象（undefined / null / 数字）时取不出令牌。
  // 这属于服务端异常，不构成「refresh token 已失效」的证据，按既有原则不清理会话。
  if (data === undefined || data === null || typeof data !== 'object') {
    return null
  }

  // 载荷是对象却不含令牌字符串：刷新已被受理却没有可用令牌（`{"code":0,"data":{}}`）。
  // 绝不能调用 saveSession——它会把访问令牌写成 undefined、刷新令牌覆盖成 "undefined"，
  // 让 hasSession() 把用户误判为已登录。会话已无法恢复，按失效清理。
  if (!isTokenPair(data)) {
    expireSession()
    return null
  }

  saveSession(data)
  return data.access_token
}
