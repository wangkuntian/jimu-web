import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'

import { refreshAccessToken } from '../auth/refresh'
import { getAccessToken, getDeviceToken, hasSession, isAccessTokenExpiring } from '../auth/session'
import { API_BASE_URL } from './config'
import type { paths } from './generated'

// openapi-fetch 在 createClient 时就把 globalThis.fetch 取值存进闭包，之后测试里
// 再 `vi.stubGlobal('fetch', ...)` 已经无效——真实请求会打到 jsdom 的 localhost:3000，
// 单元测试直接 ECONNREFUSED。因此显式传一个转发函数，把取值推迟到每次请求发起时。
// 参数用 unknown：既能通过 openapi-fetch 的类型约束，也避免为透传而复制 undici 的
// RequestInit 与 `duplex` 等细节。
const resolveFetch = (input: unknown, init?: unknown): Promise<Response> =>
  globalThis.fetch(input as RequestInfo, init as RequestInit)

export const api = createClient<paths>({ baseUrl: API_BASE_URL, fetch: resolveFetch })

/**
 * 注入访问令牌与语言偏好。
 *
 * 同一实例的 onRequest / onResponse 收到的是同一个 Request 对象，
 * Task 5 的重试中间件依赖这一点按身份查找请求副本，因此这里
 * 只改 header 并原样返回，不构造新的 Request。
 */
export const requestContextMiddleware: Middleware = {
  onRequest({ request, schemaPath }) {
    const token = getAccessToken()
    if (token !== null) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }

    // 「记住此设备」的设备令牌只在登录时上报，用于跳过 TOTP。
    // 契约把它写在 loginRequest 的说明里而没有列为 header 参数（生成类型为
    // `header?: never`），因此无法通过 per-request 的 headers 选项传入，只能在此注入。
    if (schemaPath === '/auth/login') {
      const deviceToken = getDeviceToken()
      if (deviceToken !== null) {
        request.headers.set('X-Device-Token', deviceToken)
      }
    }

    request.headers.set('Accept-Language', navigator.language || 'zh-CN')
    return request
  },
}

api.use(requestContextMiddleware)

/**
 * 请求副本缓存。
 *
 * `fetch(request)` 会消费请求体，之后再 `request.clone()` 会抛
 * `TypeError: unusable`，因此必须在发出前留一份副本。
 */
const replayable = new WeakMap<Request, Request>()

/** 401 时刷新令牌并重放一次原请求。 */
export const retryOnUnauthorizedMiddleware: Middleware = {
  async onRequest({ request }) {
    // 主动预刷新：令牌即将到期时先换新，避免把必然失败的请求发出去。
    // 刷新失败不在这里中断，仍交由下面的 401 分支决定后续处理。
    if (hasSession() && isAccessTokenExpiring()) {
      const token = await refreshAccessToken()
      if (token !== null) {
        request.headers.set('Authorization', `Bearer ${token}`)
      }
    }

    // 副本必须在请求发出前留存（此时请求体尚未被消费）。
    replayable.set(request, request.clone())
    return request
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) {
      return response
    }

    const token = await refreshAccessToken()
    const replay = replayable.get(request)
    if (token === null || replay === undefined) {
      return response
    }

    // 显式设置新令牌，不依赖克隆时可能已过期的旧值。
    replay.headers.set('Authorization', `Bearer ${token}`)
    // 用裸 fetch 重放，避免再次进入中间件造成递归。
    return fetch(replay)
  },
}

api.use(retryOnUnauthorizedMiddleware)
