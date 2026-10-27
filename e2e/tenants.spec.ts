import { test, expect } from '@playwright/test'

import { seedSession, ADMIN_IDENTITY, USER_MANAGER_IDENTITY } from './helpers/session'

const tokenBody = {
  code: 0,
  message: 'ok',
  data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
}

const tenant = {
  id: '1',
  code: 'default',
  name: '默认租户',
  status: 1,
  plan_id: 2,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

test('signs in and lists real tenants for a platform admin', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tokenBody),
    }),
  )
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: ADMIN_IDENTITY }),
    }),
  )
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [tenant],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    }),
  )
  await page.route(/\/api\/v1\/tenant-plans(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          { id: 2, code: 'pro', name: '专业版', max_users: 50, max_roles: 20, max_api_keys: 10 },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/hub$/)
  await page.getByTestId('hub-admin').click()
  await expect(page).toHaveURL(/\/admin$/)
  await page
    .locator('.sidebar-menu')
    .getByRole('menuitem', { name: '租户管理', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/tenants$/)
  // el-table 会渲染 header 与 body 两个 <table>，getByRole('table') 会撞 strict mode，
  // 因此断言落在 data-test 的横向滚动容器上（依赖 playwright.config 的 testIdAttribute）。
  await expect(page.getByTestId('tenants-table')).toContainText('default')
  await expect(page.getByTestId('tenants-table')).toContainText('专业版')
})

test('shows plan loading failures and enables saving only after a successful retry', async ({
  page,
}) => {
  let planRequests = 0
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [tenant],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    }),
  )
  await page.route(/\/api\/v1\/tenant-plans(\?.*)?$/, (route) => {
    planRequests += 1
    if (planRequests === 1) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 1005,
          message: '套餐加载失败',
          request_id: 'req-plan-e2e',
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          { id: 2, code: 'pro', name: '专业版', max_users: 50, max_roles: 20, max_api_keys: 10 },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    })
  })

  await seedSession(page, ADMIN_IDENTITY)
  await page.goto('/admin/tenants')
  await expect(page.getByTestId('tenants-table')).toContainText('默认租户')
  await page.getByRole('button', { name: '分配套餐' }).click()

  const dialog = page.locator('.el-dialog').filter({ hasText: '分配套餐' })
  await expect(page.getByTestId('tenant-plans-error')).toContainText('套餐加载失败')
  await expect(page.getByTestId('tenant-plans-error')).toContainText('req-plan-e2e')
  await expect(page.getByTestId('tenant-plan-submit')).toBeDisabled()

  await page.getByTestId('tenant-plans-error').getByRole('button', { name: '重试' }).click()
  await expect(page.getByTestId('tenant-plans-error')).toHaveCount(0)
  await expect(page.getByTestId('tenant-plan-submit')).toBeEnabled()
  await dialog.locator('.el-select__wrapper').click()
  await expect(page.getByRole('option', { name: '专业版', exact: true })).toBeVisible()
})

test('renders the no-permission page for a user manager without tenant access', async ({
  page,
}) => {
  let listRequests = 0
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) => {
    listRequests += 1
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1003, message: '无权限', request_id: 'req-e2e' }),
    })
  })

  await seedSession(page, USER_MANAGER_IDENTITY)
  await page.goto('/admin/tenants')

  await expect(page).toHaveURL(/\/admin\/tenants$/)
  await expect(page.getByText('没有访问租户管理的权限')).toBeVisible()
  // 导航项按权限隐藏，且没有发出注定 403 的列表请求
  await expect(page.getByRole('link', { name: '租户管理' })).toHaveCount(0)
  expect(listRequests).toBe(0)
})

test('renders the no-permission page when the list itself answers 403', async ({ page }) => {
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1003, message: '无权限', request_id: 'req-e2e' }),
    }),
  )
  // ADMIN_IDENTITY 带 /tenant-plans 的 GET 权限，页面会并发请求套餐列表；
  // 不打桩就会落到本机后端（假 refresh token 换来 401 → 刷新失败 → 会话失效跳登录），
  // 用例就不再自洽。这里只需要它成功返回，内容与本用例无关。
  await page.route(/\/api\/v1\/tenant-plans(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
        total: 0,
        page: 1,
        page_size: 100,
      }),
    }),
  )

  await seedSession(page, ADMIN_IDENTITY)
  await page.goto('/admin/tenants')

  await expect(page).toHaveURL(/\/admin\/tenants$/)
  await expect(page.getByText('没有访问租户管理的权限')).toBeVisible()
})
