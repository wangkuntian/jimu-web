import { beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshAccessToken } from '../../src/shared/auth/refresh'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  hasSession,
  saveSession,
} from '../../src/shared/auth/session'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('refreshAccessToken', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns null without calling the api when there is no refresh token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores the new token pair and returns the new access token', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
        }),
      ),
    )

    await expect(refreshAccessToken()).resolves.toBe('new')
    expect(getAccessToken()).toBe('new')
    expect(getRefreshToken()).toBe('refresh-2')
  })

  it('merges concurrent calls into a single request', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                jsonResponse({
                  code: 0,
                  data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
                }),
              ),
            0,
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears the session when the refresh token is rejected', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1002, message: '未认证' }, 401)),
    )

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(hasSession()).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('clears the session when the envelope reports a business error', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1002, message: '未认证' })),
    )

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('keeps the session when the request fails at the network level', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(hasSession()).toBe(true)
    expect(getAccessToken()).toBe('old')
  })

  it('does not reuse a failed refresh for the next attempt', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshAccessToken()).resolves.toBeNull()
    await expect(refreshAccessToken()).resolves.toBe('new')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves every concurrent caller with the refreshed token', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                jsonResponse({
                  code: 0,
                  data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
                }),
              ),
            0,
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ])

    expect(results).toEqual(['new', 'new', 'new'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
