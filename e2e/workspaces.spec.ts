import { test, expect } from '@playwright/test'

import { seedSession, ZERO_ROLE_IDENTITY } from './helpers/session'

test('lets an administrator choose and restore a workspace', async ({ page }) => {
  await seedSession(page)
  await page.goto('/portal')

  await expect(page).toHaveURL(/\/hub$/)
  await expect(page.getByRole('heading', { name: '选择工作台' })).toBeVisible()
  await expect(page.getByTestId('hub-workspace')).toBeVisible()
  await expect(page.getByTestId('hub-admin')).toBeVisible()

  await page.getByTestId('hub-workspace').click()
  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.locator('.topbar-current')).toHaveText('工作空间')
  expect(await page.evaluate(() => localStorage.getItem('jimu.last_surface'))).toBe('workspace')

  await page.goto('/hub')
  await expect(page).toHaveURL(/\/workspace$/)

  await page.getByRole('button', { name: '打开账户菜单' }).click()
  await page.getByRole('menuitem', { name: '切换至管理控制台' }).click()
  await expect(page).toHaveURL(/\/admin$/)
})

test('does not leave a zero-role user on the admin surface', async ({ page }) => {
  await seedSession(page, ZERO_ROLE_IDENTITY)
  await page.goto('/admin/users')

  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('heading', { name: '业务工作区' })).toBeVisible()
})

test('keeps legacy routes working', async ({ page }) => {
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [],
        total: 0,
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
        data: [],
        total: 0,
        page: 1,
        page_size: 100,
      }),
    }),
  )
  await seedSession(page)

  await page.goto('/platform/tenants')
  await expect(page).toHaveURL(/\/admin\/tenants$/)

  await page.goto('/account/security')
  await expect(page).toHaveURL(/\/workspace\/account\/security$/)
})
