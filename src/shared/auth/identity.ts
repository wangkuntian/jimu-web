import { api } from '../api/client'
import type { Identity } from '../api/types'
import { unwrapPayload } from '../api/unwrap'
import { clearIdentity, getIdentity, saveIdentity } from './session'

export type IdentityStatus = 'ok' | 'unauthenticated' | 'unavailable'

/** 进行中的引导；并发导航共享同一请求，成功后再调用直接命中缓存。 */
let inflight: Promise<IdentityStatus> | null = null

/**
 * 加载当前会话身份。
 *
 * - 成功缓存：身份已在内存时直接返回 `'ok'`，不再发请求。
 * - 失败不缓存：后端抖动后下一次导航会重试。
 * - 本函数不做任何导航、不清理 token：401/404 只把身份清空并返回 `'unauthenticated'`，
 *   是否跳登录由路由守卫决定，避免与 onSessionExpired 订阅抢导航；
 *   500/网络错误返回 `'unavailable'`，会话保持有效（后端抖动不能把用户踢出）。
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
  let status: number
  let body: unknown

  try {
    const result = await api.GET('/auth/me')
    status = result.response.status
    body = result.data
  } catch {
    // 网络错误不清理会话：可能只是离线。
    return 'unavailable'
  }

  if (status === 401 || status === 404) {
    // 404 是「token 有效但账号已删」（业务码 2001），与 401 同样按会话失效处理。
    clearIdentity()
    return 'unauthenticated'
  }
  if (status < 200 || status >= 300) {
    return 'unavailable'
  }

  let identity: Identity
  try {
    identity = unwrapPayload<Identity>(body)
  } catch {
    return 'unavailable'
  }

  if (!isIdentity(identity)) {
    clearIdentity()
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
