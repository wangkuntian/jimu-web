import type { Page } from '@playwright/test'

/**
 * 在页面脚本执行前写入一个会话，使受保护路由的守卫放行。
 *
 * 只写 refresh token 即可：守卫判定的是 hasSession()，即 refresh token 是否存在。
 * 访问令牌不在存储中，由 API 层刷新获得。
 */
export async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('jimu.refresh_token', 'e2e-refresh-token')
  })
}
