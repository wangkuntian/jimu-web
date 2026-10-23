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
    { resource: '/api/v1/users', action: 'GET' },
    { resource: '/api/v1/users', action: 'POST' },
    { resource: '/api/v1/users/*', action: 'PUT' },
    { resource: '/api/v1/users/*', action: 'DELETE' },
    { resource: '/api/v1/users/*/roles', action: 'POST' },
    { resource: '/api/v1/roles', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'POST' },
    { resource: '/api/v1/tenants/*', action: 'GET' },
    { resource: '/api/v1/tenants/*', action: 'PUT' },
    { resource: '/api/v1/tenants/*', action: 'DELETE' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

/** 能管理用户但不能读取租户：用于验证管理面已进入仍可渲染租户页的无权限态。 */
export const USER_MANAGER_IDENTITY: E2eIdentity = {
  ...ADMIN_IDENTITY,
  permissions: ADMIN_IDENTITY.permissions.filter(
    (permission) => !permission.resource.startsWith('/api/v1/tenants'),
  ),
}

/** 零角色用户：/auth/me 返回 200 + 空数组，这是合法身份而不是会话失效。 */
export const ZERO_ROLE_IDENTITY: E2eIdentity = {
  user: {
    id: 11,
    username: 'newcomer',
    status: 1,
    tenant_id: 1,
    created_at: '2026-10-19T00:00:00Z',
  },
  roles: [],
  permissions: [],
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
