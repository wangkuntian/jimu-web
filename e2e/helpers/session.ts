import type { Page } from '@playwright/test'

export interface E2eIdentity {
  user: { id: number; username: string; status: number; tenant_id: number; created_at: string }
  roles: string[]
  permissions: { resource: string; action: string }[]
}

export const ADMIN_IDENTITY: E2eIdentity = {
  user: { id: 1, username: 'admin', status: 1, tenant_id: 1, created_at: '2026-10-19T00:00:00Z' },
  roles: ['超级管理员'],
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'POST' },
    { resource: '/api/v1/tenants/*', action: 'GET' },
    { resource: '/api/v1/tenants/*', action: 'PUT' },
    { resource: '/api/v1/tenants/*', action: 'DELETE' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

/**
 * 让会话引导返回给定身份。
 *
 * 必须打桩：路由守卫会在受保护导航前请求 `/auth/me`，本地若同时跑着真实后端，
 * 假 refresh token 会换来 401，把用例弹回登录页——E2E 就不再是自洽的。
 */
export async function mockIdentity(
  page: Page,
  identity: E2eIdentity = ADMIN_IDENTITY,
): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: identity }),
    })
  })
}

/** 在页面脚本执行前写入会话，并让会话引导可用。 */
export async function seedSession(
  page: Page,
  identity: E2eIdentity = ADMIN_IDENTITY,
): Promise<void> {
  await mockIdentity(page, identity)
  await page.addInitScript(() => {
    window.sessionStorage.setItem('jimu.refresh_token', 'e2e-refresh-token')
  })
}
