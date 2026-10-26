import { expect, test } from '@playwright/test'

import { ADMIN_IDENTITY, seedSession } from './helpers/session'

const role = {
  id: '370528943163310080',
  tenant_id: '1',
  name: '运营管理员',
  description: '负责租户运营',
  status: 1,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const tenants = {
  code: 0,
  message: 'ok',
  data: [
    {
      id: '1',
      code: 'default',
      name: '默认租户',
      status: 1,
      plan_id: 0,
      created_at: '',
      updated_at: '',
    },
  ],
  total: 1,
  page: 1,
  page_size: 100,
}

const userListPermission = {
  id: '370528943163420080',
  name: '用户列表',
  resource: '/api/v1/users',
  action: 'GET',
  created_at: '2026-10-19T00:00:00Z',
}

const userCreatePermission = {
  id: '370528943163420081',
  name: '用户创建',
  resource: '/api/v1/users',
  action: 'POST',
  created_at: '2026-10-19T00:00:00Z',
}

test('manages roles with the shared admin page and replaces permissions', async ({ page }) => {
  let permissionPayload: unknown
  const identity = {
    ...ADMIN_IDENTITY,
    permissions: [
      ...ADMIN_IDENTITY.permissions,
      { resource: '/api/v1/roles', action: 'POST' },
      { resource: '/api/v1/roles/*', action: 'GET' },
      { resource: '/api/v1/roles/*', action: 'PUT' },
      { resource: '/api/v1/roles/*', action: 'DELETE' },
      { resource: '/api/v1/roles/*/permissions', action: 'GET' },
      { resource: '/api/v1/roles/*/permissions', action: 'POST' },
      { resource: '/api/v1/permissions', action: 'GET' },
    ],
  }

  await page.route(/\/api\/v1\/roles\/[^/]+\/permissions$/, async (route) => {
    if (route.request().method() === 'POST') {
      permissionPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [userListPermission] }),
    })
  })
  await page.route(/\/api\/v1\/roles(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [role],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    }),
  )
  await page.route(/\/api\/v1\/permissions(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [userListPermission, userCreatePermission],
        total: 2,
        page: 1,
        page_size: 100,
      }),
    }),
  )
  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tenants),
    }),
  )

  await seedSession(page, identity)
  await page.goto('/admin/roles')

  await expect(page.getByRole('heading', { name: '角色管理' })).toBeVisible()
  await expect(
    page.locator('.sidebar-menu').getByRole('menuitem', { name: '角色管理', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('roles-table')).toContainText('运营管理员')
  await expect(page.getByTestId('roles-table')).toContainText('默认租户')

  await page
    .getByRole('row', { name: /运营管理员/ })
    .getByRole('button', { name: '权限' })
    .click()
  const drawer = page.locator('.el-drawer').filter({ hasText: '分配权限' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('用户列表')).toBeVisible()

  await drawer.locator('.el-checkbox').filter({ hasText: '用户创建' }).click()
  await drawer.getByRole('button', { name: '保存权限' }).click()

  await expect
    .poll(() => permissionPayload)
    .toEqual({
      permission_ids: [userListPermission.id, userCreatePermission.id],
    })
})
