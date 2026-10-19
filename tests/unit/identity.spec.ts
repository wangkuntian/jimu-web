import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { api } from '../../src/shared/api/client'
import { ensureIdentity } from '../../src/shared/auth/identity'
import { clearIdentity, getIdentity, hasSession, saveSession } from '../../src/shared/auth/session'

vi.mock('../../src/shared/api/client', () => ({ api: { GET: vi.fn() } }))

const getMock = api.GET as unknown as Mock
const tokens = { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 }

/** 后端运行时永远返回信封；`data` 参数就是 openapi-fetch 解析出的完整响应体。 */
function respond(status: number, body: unknown): void {
  getMock.mockResolvedValueOnce({ data: body, response: new Response(null, { status }) })
}

const me = {
  user: { id: 9, username: 'admin', status: 1, tenant_id: 1, created_at: '2026-10-19T00:00:00Z' },
  roles: ['超级管理员'],
  permissions: [{ resource: '/api/v1/tenants', action: 'GET' }],
}

describe('ensureIdentity', () => {
  beforeEach(() => {
    clearIdentity()
    sessionStorage.clear()
    getMock.mockReset()
  })

  it('stores the envelope payload as the current identity', async () => {
    respond(200, { code: 0, message: 'ok', data: me })

    await expect(ensureIdentity()).resolves.toBe('ok')
    expect(getIdentity()).toEqual(me)
  })

  it('accepts a zero-role user as an identity, not as a rejected session', async () => {
    respond(200, { code: 0, message: 'ok', data: { ...me, roles: [], permissions: [] } })

    await expect(ensureIdentity()).resolves.toBe('ok')
    expect(getIdentity()?.permissions).toEqual([])
  })

  it('reports an unauthenticated session on 401 and clears the identity', async () => {
    saveSession(tokens)
    getMock.mockResolvedValueOnce({
      data: undefined,
      response: new Response(null, { status: 401 }),
    })

    await expect(ensureIdentity()).resolves.toBe('unauthenticated')
    expect(getIdentity()).toBeNull()
    // 会话是否清理由守卫决定，identity 层不越权导航
    expect(hasSession()).toBe(true)
  })

  it('reports an unauthenticated session when the account is gone (404 / code 2001)', async () => {
    respond(404, { code: 2001, message: '用户不存在', request_id: 'req-9' })

    await expect(ensureIdentity()).resolves.toBe('unauthenticated')
  })

  it('keeps the session when the backend fails', async () => {
    saveSession(tokens)
    respond(500, { code: 1005, message: '服务器内部错误' })

    await expect(ensureIdentity()).resolves.toBe('unavailable')
    expect(getIdentity()).toBeNull()
    expect(hasSession()).toBe(true)
  })

  it('keeps the session when the request itself rejects', async () => {
    saveSession(tokens)
    getMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(ensureIdentity()).resolves.toBe('unavailable')
    expect(hasSession()).toBe(true)
  })

  it('treats a payload that is not an identity as unavailable', async () => {
    respond(200, { code: 0, message: 'ok', data: { roles: null, permissions: null } })

    await expect(ensureIdentity()).resolves.toBe('unavailable')
    expect(getIdentity()).toBeNull()
  })

  it('shares one request between concurrent callers and caches on success', async () => {
    respond(200, { code: 0, message: 'ok', data: me })

    const [first, second] = await Promise.all([ensureIdentity(), ensureIdentity()])
    expect([first, second]).toEqual(['ok', 'ok'])
    expect(getMock).toHaveBeenCalledTimes(1)

    await expect(ensureIdentity()).resolves.toBe('ok')
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('retries after a failure because only success is cached', async () => {
    respond(500, { code: 1005, message: '服务器内部错误' })
    await expect(ensureIdentity()).resolves.toBe('unavailable')

    respond(200, { code: 0, message: 'ok', data: me })
    await expect(ensureIdentity()).resolves.toBe('ok')
    expect(getMock).toHaveBeenCalledTimes(2)
  })
})
