import { api } from '../api/client'
import type { Identity } from '../api/types'
import { ErrorCode, resolveEnvelope, unwrapPayload } from '../api/unwrap'
import { clearIdentity, getIdentity, saveIdentity, setIdentityStatus } from './session'
import type { IdentityStatus } from './session'

// 状态本体住在 session（身份与会话同生共死）；这里只做统一出口，供视图订阅。
export { getIdentityStatus } from './session'
export type { IdentityStatus, IdentityState } from './session'

/** 进行中的引导；并发导航共享同一请求，成功后再调用直接命中缓存。 */
let inflight: Promise<IdentityStatus> | null = null

/**
 * 加载当前会话身份。
 *
 * - 成功缓存：身份已在内存时直接返回 `'ok'`，不再发请求。
 * - 失败不缓存：后端抖动后下一次导航会重试。
 * - 本函数不做任何导航、不清理 token：只有 401 与「404 + 业务码 2001（用户不存在）」
 *   才把身份清空并返回 `'unauthenticated'`，是否跳登录由路由守卫决定，避免与
 *   onSessionExpired 订阅抢导航；其余 404、500 与网络错误返回 `'unavailable'`，
 *   会话保持有效（代理重写/basePath 错配/后端回滚也会返回 404，不能把用户踢出）。
 */
export function ensureIdentity(): Promise<IdentityStatus> {
  if (getIdentity() !== null) {
    return Promise.resolve('ok')
  }
  inflight ??= loadIdentity().finally(() => {
    inflight = null
  })
  return inflight
}

async function loadIdentity(): Promise<IdentityStatus> {
  let data: unknown
  let error: unknown
  let response: Response

  try {
    const result = await api.GET('/auth/me')
    data = result.data
    error = result.error
    response = result.response
  } catch {
    // 网络错误不清理会话：可能只是离线。
    setIdentityStatus('unavailable')
    return 'unavailable'
  }

  const status = response.status

  if (status === 401) {
    clearIdentity()
    setIdentityStatus('unauthenticated')
    return 'unauthenticated'
  }

  if (status === 404) {
    // 404 只有在业务码是 2001「用户不存在」时才等价于会话失效（token 有效但账号已删）。
    // openapi-fetch 把非 2xx 的响应体放在 error 侧，2xx 放在 data 侧，统一交给 resolveEnvelope。
    const envelope = resolveEnvelope({ data, error, response })
    if (envelope?.code === ErrorCode.userNotFound) {
      clearIdentity()
      setIdentityStatus('unauthenticated')
      return 'unauthenticated'
    }
    setIdentityStatus('unavailable')
    return 'unavailable'
  }

  if (status < 200 || status >= 300) {
    setIdentityStatus('unavailable')
    return 'unavailable'
  }

  let identity: Identity
  try {
    identity = unwrapPayload<Identity>(data)
  } catch {
    setIdentityStatus('unavailable')
    return 'unavailable'
  }

  if (!isIdentity(identity)) {
    clearIdentity()
    setIdentityStatus('unavailable')
    return 'unavailable'
  }

  saveIdentity(identity)
  return 'ok'
}

/** roles/permissions 必须是数组：`null` 会让权限判定在渲染期直接抛错。 */
function isIdentity(value: Identity): boolean {
  return (
    Array.isArray(value.roles) &&
    Array.isArray(value.permissions) &&
    typeof value.user === 'object' &&
    value.user !== null
  )
}
