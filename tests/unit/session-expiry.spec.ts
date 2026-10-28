import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { LOGIN_ROUTE } from '../../src/app/guards/session'
import router from '../../src/app/router'
import { clearSession, expireSession, saveSession } from '../../src/shared/auth/session'

// router/index.ts 在模块加载时把「会话失效 → 跳登录页」的订阅装配到真实 router 上，
// 因此这里直接驱动那个实例，验证跳转目标确实带上当前路径。
describe('session expiry navigation', () => {
  beforeEach(async () => {
    clearSession()
    sessionStorage.clear()
    await router.replace(LOGIN_ROUTE)
    await router.isReady()
  })

  it('returns to the login page carrying the current path when the session expires', async () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })
    await router.push('/hub')

    expireSession()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(LOGIN_ROUTE)
    expect(router.currentRoute.value.query.redirect).toBe('/hub')
  })

  it('does not navigate on a plain logout', async () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })
    await router.push('/hub')

    clearSession()
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/hub')
  })
})
