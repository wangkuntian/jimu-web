import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { seedSession } from './helpers/session'

const tenant = {
  id: 'tenant-1',
  code: 'acme',
  name: 'Acme',
  status: 1,
  plan_id: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const disabledTenant = {
  ...tenant,
  id: 'tenant-disabled',
  code: 'disabled',
  name: '已停用租户',
  status: 0,
}

const user = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  phone: '13800000000',
  status: 1,
  tenant: { id: tenant.id, name: tenant.name },
  roles: [{ id: 'role-developer', name: 'developer' }],
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const roles = [
  {
    id: 'role-developer',
    name: 'developer',
    code: '',
    scope: 'tenant',
    is_system: false,
  },
  {
    id: 'role-reviewer',
    name: 'reviewer',
    code: '',
    scope: 'tenant',
    is_system: false,
  },
]

interface CapturedPayloads {
  create?: unknown
  updates: unknown[]
  roles?: unknown
  deleted: string[]
  tenantListUrls: string[]
}

async function setupUserRoutes(page: Page): Promise<CapturedPayloads> {
  const payloads: CapturedPayloads = { updates: [], deleted: [], tenantListUrls: [] }

  await page.route('**/api/v1/users**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: [user],
          total: 1,
          page: 1,
          page_size: 20,
        }),
      })
      return
    }

    if (request.method() === 'POST' && pathname === '/api/v1/users') {
      payloads.create = await request.postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: user }),
      })
      return
    }

    if (request.method() === 'POST' && pathname.endsWith('/roles')) {
      payloads.roles = await request.postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok' }),
      })
      return
    }

    if (request.method() === 'PUT') {
      payloads.updates.push(await request.postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok' }),
      })
      return
    }

    if (request.method() === 'DELETE') {
      payloads.deleted.push(pathname.split('/').at(-1) ?? '')
      await route.fulfill({ status: 204 })
      return
    }

    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 5000, message: 'unexpected user request' }),
    })
  })

  await page.route(/\/api\/v1\/tenants(\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    payloads.tenantListUrls.push(url.toString())
    const status = url.searchParams.get('status')
    const data = status === '1' ? [tenant] : [tenant, disabledTenant]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data,
        total: data.length,
        page: 1,
        page_size: 100,
      }),
    })
  })

  await page.route(/\/api\/v1\/roles\/options(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: roles,
      }),
    }),
  )

  return payloads
}

test('creates a platform user inside the selected tenant', async ({ page }) => {
  const payloads = await setupUserRoutes(page)
  await seedSession(page)
  await page.goto('/admin/users')

  await expect(page.getByTestId('users-table')).toContainText('alice')
  await page.getByTestId('user-create').click()

  const drawer = page.locator('.el-drawer').filter({ hasText: '新建用户' })
  await drawer
    .locator('.el-form-item')
    .filter({ hasText: '所属租户' })
    .locator('.el-select__wrapper')
    .click()
  await page.getByRole('option', { name: 'Acme', exact: true }).click()
  await drawer
    .locator('.el-form-item')
    .filter({ hasText: '角色' })
    .locator('.el-select__wrapper')
    .click()
  await page.getByRole('option', { name: 'reviewer', exact: true }).click()
  await page.keyboard.press('Escape')
  await drawer.getByLabel('用户名').fill('bob')
  await drawer.getByLabel('初始密码').fill('secret123')
  await drawer.getByLabel('邮箱').fill('bob@example.com')
  await drawer.getByRole('button', { name: '创建用户' }).click()

  await expect(page.getByText('用户已创建')).toBeVisible()
  expect(payloads.create).toEqual({
    tenant_id: tenant.id,
    username: 'bob',
    password: 'secret123',
    email: 'bob@example.com',
    phone: '',
    role_ids: ['role-reviewer'],
  })
})

test('offers only active tenants when creating users but keeps all tenants in filters', async ({
  page,
}) => {
  const payloads = await setupUserRoutes(page)
  await seedSession(page)
  await page.goto('/admin/users')
  await expect(page.getByTestId('users-table')).toContainText('alice')

  await page.getByTestId('user-tenant-filter').locator('.el-select__wrapper').click()
  await expect(page.getByRole('option', { name: 'Acme', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '已停用租户', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('user-create').click()
  const drawer = page.locator('.el-drawer').filter({ hasText: '新建用户' })
  await drawer
    .locator('.el-form-item')
    .filter({ hasText: '所属租户' })
    .locator('.el-select__wrapper')
    .click()
  const visibleOptions = page.locator('.el-select-dropdown:visible')
  await expect(visibleOptions.getByRole('option', { name: 'Acme', exact: true })).toBeVisible()
  await expect(visibleOptions.getByRole('option', { name: '已停用租户', exact: true })).toHaveCount(
    0,
  )
  expect(payloads.tenantListUrls).toHaveLength(1)
  expect(new URL(payloads.tenantListUrls[0]!).searchParams.has('status')).toBe(false)
})

test('shows role option failures and disables role assignment', async ({ page }) => {
  await setupUserRoutes(page)
  await page.route(/\/api\/v1\/roles\/options(\?.*)?$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1005, message: '角色选项加载失败' }),
    }),
  )
  await seedSession(page)
  await page.goto('/admin/users')
  await expect(page.getByTestId('users-table')).toContainText('alice')

  await page.getByRole('button', { name: '角色', exact: true }).click()
  const roleDialog = page.locator('.el-dialog').filter({ hasText: '分配角色' })
  await expect(page.getByTestId('user-role-options-error')).toBeVisible()
  await expect(page.getByTestId('user-role-options-error')).toContainText('角色选项加载失败')
  await expect(roleDialog.getByRole('button', { name: '保存角色' })).toBeDisabled()
})

test('edits, reassigns roles, stops, and deletes a user', async ({ page }) => {
  const payloads = await setupUserRoutes(page)
  await seedSession(page)
  await page.goto('/admin/users')
  await expect(page.getByTestId('users-table')).toContainText('alice')

  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editDrawer = page.locator('.el-drawer').filter({ hasText: '编辑用户' })
  await editDrawer.getByLabel('邮箱').fill('updated@example.com')
  await editDrawer.getByLabel('手机号').fill('13900000000')
  await editDrawer
    .locator('.el-form-item')
    .filter({ hasText: '状态' })
    .locator('.el-select__wrapper')
    .click()
  await page.getByRole('option', { name: '停用', exact: true }).click()
  await editDrawer.getByRole('button', { name: '保存更改' }).click()
  await expect(page.getByText('用户已更新')).toBeVisible()
  expect(payloads.updates[0]).toEqual({
    status: 0,
    email: 'updated@example.com',
    phone: '13900000000',
  })

  await page.getByRole('button', { name: '角色', exact: true }).click()
  const roleDialog = page.locator('.el-dialog').filter({ hasText: '分配角色' })
  await roleDialog.locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: 'reviewer', exact: true }).click()
  await page.keyboard.press('Escape')
  await roleDialog.getByRole('button', { name: '保存角色' }).click()
  await expect(page.getByText('用户角色已更新')).toBeVisible()
  expect(payloads.roles).toEqual({ role_ids: ['role-developer', 'role-reviewer'] })

  await page.getByRole('button', { name: '停用', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '停用' }).click()
  await expect(page.getByText('用户已停用')).toBeVisible()
  expect(payloads.updates[1]).toEqual({ status: 0 })

  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('用户已删除')).toBeVisible()
  expect(payloads.deleted).toEqual([user.id])
})
