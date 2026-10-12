import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../src/shared/api/client'
import { clearSession, getAccessToken, saveSession } from '../../src/shared/auth/session'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * `refreshAccessToken`（Task 4）用字符串 URL 调用裸 `fetch`，openapi-fetch 则传
 * `Request` 实例，因此测试桩收到的入参有两种形态。统一归一化成 `Request`，
 * 才能在同一个桩里对两种调用都取到 pathname。
 */
function toRequest(input: RequestInfo | URL): Request {
  return input instanceof Request ? input : new Request(input)
}

describe('retryOnUnauthorizedMiddleware', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('refreshes and replays the request with the new token on 401', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const request = toRequest(input)
        requests.push(request)
        const url = new URL(request.url)
        if (url.pathname.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        if (requests.length === 1) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 0, data: [{ id: 1 }] })
      }),
    )

    const result = await api.GET('/auth/devices')

    expect(result.response.status).toBe(200)
    expect(requestCount(requests, '/auth/devices')).toBe(2)
    expect(getAccessToken()).toBe('new')
    const replayed = requests.filter(
      (request) => new URL(request.url).pathname === '/api/v1/auth/devices',
    )
    expect(replayed[1]!.headers.get('Authorization')).toBe('Bearer new')
  })

  it('refreshes before sending when the access token is about to expire', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 30 })
    const paths: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const request = toRequest(input)
        requests.push(request)
        const path = new URL(request.url).pathname
        paths.push(path)
        if (path.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        return jsonResponse({ code: 0, data: [] })
      }),
    )

    await api.GET('/auth/devices')

    expect(paths).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/devices'])
    const devices = requests.find(
      (request) => new URL(request.url).pathname === '/api/v1/auth/devices',
    )
    expect(devices!.headers.get('Authorization')).toBe('Bearer new')
  })

  it('does not retry when the refresh fails, and surfaces the 401', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const request = toRequest(input)
        requests.push(request)
        if (new URL(request.url).pathname.endsWith('/auth/refresh')) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 1002, message: '未认证' }, 401)
      }),
    )

    const result = await api.GET('/auth/devices')

    expect(result.response.status).toBe(401)
    expect(requestCount(requests, '/auth/devices')).toBe(1)
  })

  it('replays a request that carries a body', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const request = toRequest(input)
        requests.push(request)
        const url = new URL(request.url)
        if (url.pathname.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        bodies.push(await request.clone().text())
        if (bodies.length === 1) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 0, data: {} })
      }),
    )

    const result = await api.POST('/auth/mfa/enable', { body: { code: '123456' } })

    expect(result.response.status).toBe(200)
    expect(bodies).toEqual(['{"code":"123456"}', '{"code":"123456"}'])
  })
})

function requestCount(requests: Request[], suffix: string): number {
  return requests.filter((request) => new URL(request.url).pathname === `/api/v1${suffix}`).length
}
