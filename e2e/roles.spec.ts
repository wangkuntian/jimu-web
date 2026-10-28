import { expect, test } from '@playwright/test'

import { ADMIN_IDENTITY, seedSession } from './helpers/session'

const role = {
  id: '370528943163310080',
  tenant_id: '1',
  name: '运营管理员',
  description: '负责租户运营',
  code: '',
  scope: 'tenant',
  is_system: false,
  status: 1,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const systemRole = {
  ...role,
  id: '370528943163310090',
  name: '平台超级管理员',
  description: '平台最高权限',
  code: 'platform_super_admin',
  scope: 'platform',
  is_system: true,
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
      plan_id: '0',
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
  let deletePayload = ''
  let updatePayload: unknown
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
        data: [role, systemRole],
        total: 2,
        page: 1,
        page_size: 20,
      }),
    }),
  )
  await page.route(/\/api\/v1\/roles\/[^/]+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      updatePayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok' }),
      })
      return
    }
    if (route.request().method() === 'DELETE') {
      deletePayload = new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
      await route.fulfill({ status: 204 })
      return
    }
    await route.fallback()
  })
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
  const customRow = page.getByRole('row', { name: /运营管理员/ })
  await expect(page.getByTestId('roles-table')).toContainText('运营管理员')
  await expect(page.getByTestId('roles-table')).toContainText('默认租户')
  const systemRow = page.getByRole('row', { name: /平台超级管理员/ })
  await expect(systemRow).toContainText('platform_super_admin')
  await expect(systemRow).toContainText('系统')
  await expect(systemRow.getByRole('button', { name: '编辑' })).toHaveCount(0)
  await expect(systemRow.getByRole('button', { name: '停用' })).toHaveCount(0)
  await expect(systemRow.getByRole('button', { name: '查看权限' })).toBeVisible()

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

  await systemRow.getByRole('button', { name: '查看权限' }).click()
  const readOnlyDrawer = page.locator('.el-drawer').filter({ hasText: '查看权限' })
  await expect(readOnlyDrawer).toBeVisible()
  await expect(readOnlyDrawer.getByText('系统角色的权限由后端维护，不可在此修改')).toBeVisible()
  await expect(readOnlyDrawer.getByRole('button', { name: '保存权限' })).toHaveCount(0)
  await readOnlyDrawer.getByRole('button', { name: '关闭' }).click()

  await customRow.getByRole('button', { name: '运营管理员的更多操作' }).click()
  await page.getByRole('menuitem', { name: '停用', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '停用' }).click()
  await expect
    .poll(() => updatePayload)
    .toEqual({
      name: role.name,
      description: role.description,
      status: 0,
    })

  await customRow.getByRole('button', { name: '运营管理员的更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await expect.poll(() => deletePayload).toBe(role.id)
})
