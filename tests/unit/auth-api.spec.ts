import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchAuthConfig,
  fetchCaptcha,
  login,
  logout,
  logoutAll,
  register,
} from '../../src/features/auth/api'
import {
  clearSession,
  getAccessToken,
  getDeviceToken,
  hasSession,
  saveSession,
} from '../../src/shared/auth/session'
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

    const rejection = login({ username: 'alice', password: 'bad' })
    await expect(rejection).rejects.toBeInstanceOf(ApiError)
    await expect(rejection).rejects.toMatchObject({ code: 1006 })
  })

  it('surfaces the 1006 business code carried by a real 401', async () => {
    // openapi-fetch 只在 2xx 把响应体写进 data；401 的 {code:1006} 落在 error 里。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1006, message: '认证信息无效' }, 401)),
    )

    const rejection = login({ username: 'alice', password: 'bad' })
    await expect(rejection).rejects.toBeInstanceOf(ApiError)
    await expect(rejection).rejects.toMatchObject({ code: 1006, message: '认证信息无效' })
    expect(getAccessToken()).toBeNull()
  })

  it('surfaces the 4001 business code carried by a real 400', async () => {
    // 4001（需要图形验证码）走 400，是登录页 needsCaptcha 分支的唯一依据。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 4001, message: '需要图形验证码' }, 400)),
    )

    await expect(login({ username: 'alice', password: 'secret123' })).rejects.toMatchObject({
      code: 4001,
      message: '需要图形验证码',
    })
  })

  it('surfaces the 2002 business code carried by a real 409', async () => {
    // 注册重名（2002）走 409；只读 data 会让注册页的「用户名已存在」分支永远走不到。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 2002, message: '用户名已存在' }, 409)),
    )

    await expect(register({ username: 'alice', password: 'secret123' })).rejects.toMatchObject({
      code: 2002,
      message: '用户名已存在',
    })
  })

  it('normalizes the register 429 to the rate-limited business code', async () => {
    // 注册限流的响应体可能不是标准信封；状态码 429 本身才是唯一可靠信号。
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('rate limited', {
            status: 429,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ),
    )

    const rejection = register({ username: 'alice', password: 'secret123' })
    await expect(rejection).rejects.toBeInstanceOf(ApiError)
    await expect(rejection).rejects.toMatchObject({ code: 1007 })
  })

  it('unwraps the runtime envelope returned by the auth config endpoint', async () => {
    // /auth/config 的契约标注是载荷型，运行时仍是 {code,message,data} 信封。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: 0, data: { public_registration: true, provisioning_enabled: false } }),
      ),
    )

    await expect(fetchAuthConfig()).resolves.toEqual({
      public_registration: true,
      provisioning_enabled: false,
    })
  })

  it('clears the session on logout but keeps the device token', async () => {
    saveSession({
      access_token: 'a1',
      refresh_token: 'r1',
      expires_in: 1800,
      device_token: 'device-1',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: {} })),
    )

    await logout()

    expect(hasSession()).toBe(false)
    expect(getDeviceToken()).toBe('device-1')
  })

  it('clears the session even when the logout request rejects', async () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(logout()).rejects.toBeInstanceOf(TypeError)
    expect(hasSession()).toBe(false)
  })
})
