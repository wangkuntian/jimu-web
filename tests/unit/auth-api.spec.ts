import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCaptcha, login, logoutAll } from '../../src/features/auth/api'
import { clearSession, getAccessToken, getDeviceToken } from '../../src/shared/auth/session'
import { ApiError } from '../../src/shared/api/unwrap'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('auth api', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns the captcha payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          data: { captcha_id: 'c1', captcha_image: 'data:image/png;base64,AA' },
        }),
      ),
    )

    await expect(fetchCaptcha()).resolves.toEqual({
      captcha_id: 'c1',
      captcha_image: 'data:image/png;base64,AA',
    })
  })

  it('saves the session on a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({
          code: 0,
          data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
        })
      }),
    )

    await login({ username: 'alice', password: 'secret123' })

    expect(getAccessToken()).toBe('a1')
    expect(JSON.parse(await requests[0]!.clone().text())).toEqual({
      username: 'alice',
      password: 'secret123',
    })
  })

  it('surfaces the business code so the login form can reveal the totp field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 2006, message: '需要 TOTP 验证码' })),
    )

    await expect(login({ username: 'alice', password: 'secret123' })).rejects.toMatchObject({
      code: 2006,
    })
    expect(getAccessToken()).toBeNull()
  })

  it('reports the stored device token on the login request', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({
          code: 0,
          data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
        })
      }),
    )

    await login({ username: 'alice', password: 'secret123', remember_device: true })

    expect(requests[0]!.headers.get('X-Device-Token')).toBe('device-1')
  })

  it('clears the device token on logout-all', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: {} })),
    )

    await logoutAll()

    expect(getDeviceToken()).toBeNull()
  })

  it('throws ApiError when the login envelope reports a business error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1006, message: '认证信息无效' })),
    )

    await expect(login({ username: 'alice', password: 'bad' })).rejects.toBeInstanceOf(ApiError)
  })
})
