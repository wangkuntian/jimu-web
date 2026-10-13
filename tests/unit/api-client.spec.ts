import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../src/shared/api/client'
import { clearSession, saveSession } from '../../src/shared/auth/session'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({ code: 0, data: [] })
      }),
    )
  })

  it('uses an absolute api prefix so Node can parse the URL', async () => {
    await api.GET('/auth/devices')

    expect(requests[0]).toBeDefined()
    expect(new URL(requests[0]!.url).pathname).toBe('/api/v1/auth/devices')
  })

  it('sends the access token when a session exists', async () => {
    saveSession({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 1800 })

    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('omits the Authorization header without a session', async () => {
    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('Authorization')).toBeNull()
  })

  it('reports the stored device token on the login request only', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')

    await api.POST('/auth/login', { body: { username: 'alice', password: 'secret123' } })
    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('X-Device-Token')).toBe('device-1')
    expect(requests[1]!.headers.get('X-Device-Token')).toBeNull()
  })
})
