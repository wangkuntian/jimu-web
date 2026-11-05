import { test, expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

/**
 * 真机联调：要求 ../jimu 的 demo 栈已启动（make demo 或 make demo-e2e），并完成结构种子。
 * 默认跳过（CI 上没有后端），本地用：
 *   make demo-e2e
 * 或手工：
 *   E2E_REAL_BACKEND=1 E2E_ADMIN_PASSWORD="$(cat ../jimu/secrets/admin_password.txt)" \
 *     bunx playwright test e2e/real-backend.spec.ts
 */
test.skip(process.env.E2E_REAL_BACKEND !== '1', '需要真实后端，见 README 的「本地真机联调」')

const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? ''
test.skip(adminPassword === '', '需要 E2E_ADMIN_PASSWORD，见 docs/DEMO.md')

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin$/)
}

async function openAdminPage(page: Page, label: string, url: RegExp): Promise<void> {
  await page.locator('.sidebar-menu').getByRole('menuitem', { name: label, exact: true }).click()
  await expect(page).toHaveURL(url)
}

interface E2eCleanupTargets {
  username: string
  roleName: string
  tenantCode: string
}

/** 用 API 清理本次用例创建的数据；失败时只告警，不覆盖原始断言。 */
async function cleanupE2eData(
  request: APIRequestContext,
  targets: E2eCleanupTargets,
): Promise<void> {
  try {
    const login = await request.post('/api/v1/auth/login', {
      data: { username: 'admin', password: adminPassword },
    })
    if (!login.ok()) {
      return
    }
    const loginBody = (await login.json()) as { data?: { access_token?: string } }
    const token = loginBody.data?.access_token
    if (token === undefined) {
      return
    }
    const headers = { Authorization: `Bearer ${token}` }

    const users = await request.get('/api/v1/users', {
      headers,
      params: { page: 1, page_size: 20, username: targets.username },
    })
    if (users.ok()) {
      const body = (await users.json()) as { data?: { id: string; username: string }[] }
      for (const user of body.data ?? []) {
        if (user.username === targets.username) {
          await request.delete(`/api/v1/users/${user.id}`, { headers })
        }
      }
    }

    const roles = await request.get('/api/v1/roles', {
      headers,
      params: { page: 1, page_size: 20, keyword: targets.roleName },
    })
    if (roles.ok()) {
      const body = (await roles.json()) as { data?: { id: string; name: string }[] }
      for (const role of body.data ?? []) {
        if (role.name === targets.roleName) {
          await request.delete(`/api/v1/roles/${role.id}`, { headers })
        }
      }
    }

    const tenants = await request.get('/api/v1/tenants', {
      headers,
      params: { page: 1, page_size: 20, keyword: targets.tenantCode },
    })
    if (tenants.ok()) {
      const body = (await tenants.json()) as { data?: { id: string; code: string }[] }
      for (const tenant of body.data ?? []) {
        if (tenant.code === targets.tenantCode) {
          await request.delete(`/api/v1/tenants/${tenant.id}`, { headers })
        }
      }
    }
  } catch (error) {
    console.warn(`E2E 清理失败（不影响断言）：${String(error)}`)
  }
}

test('drives the real stack: register → zero-role login → admin tenant list', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const username = `e2e_${suffix}`

  // 1) 注册开关来自真实后端；dev 配置下注册入口可见
  await page.goto('/login')
  await expect(page.getByTestId('register-link')).toBeVisible()
  await page.getByTestId('register-link').click()

  await page.getByTestId('username').locator('input').fill(username)
  await page.getByTestId('password').locator('input').fill('secret123')
  await page.getByRole('button', { name: '完成注册' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1/)
  await expect(page.getByText('注册成功')).toBeVisible()

  // 2) 注册出来的用户零角色：能登录、进得去外壳，但没有租户管理入口
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('menuitem', { name: '用户管理', exact: true })).toHaveCount(0)
  await page.goto('/admin/tenants')
  await expect(page).toHaveURL(/\/workspace$/)

  // 3) admin 登录后看到真实列表。
  // 已登录用户会被会话守卫从 /login 弹回 /hub，所以先走真实登出再换账号。
  await page.getByRole('button', { name: '打开账户菜单' }).click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login/)
  await loginAsAdmin(page)
  await openAdminPage(page, '租户管理', /\/admin\/tenants$/)
  // el-table 会渲染 header 与 body 两个 <table>，断言落在 data-test 的容器上。
  await expect(page.getByTestId('tenants-table')).toContainText('default')
})

test('create → assign plan → delete a runtime-created tenant', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const tenantCode = `e2e_${suffix}`

  await loginAsAdmin(page)
  await openAdminPage(page, '租户管理', /\/admin\/tenants$/)
  await expect(page.getByTestId('tenants-table')).toContainText('default')

  // 新建 → 改套餐 → 删除（删除走确认框）
  // 新建对话框的输入框没有 data-test 钩子，按 el-form-item 的 label 定位；提交按钮文案是「创建」。
  await page.getByTestId('tenant-create').click()
  await page.getByLabel('租户编码').fill(tenantCode)
  await page.getByLabel('租户名称').fill('联调租户')
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.getByTestId('tenants-table')).toContainText(tenantCode)

  const row = page.getByRole('row', { name: new RegExp(tenantCode) })
  await row.getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '分配套餐', exact: true }).click()
  // 套餐下拉同时有 aria-label="套餐" 的 combobox 与 listbox，getByLabel 会撞 strict mode；
  // 而 combobox 输入框被已选项占位元素挡住，可点的是 el-select 的外层 wrapper。
  const planDialog = page.locator('.el-dialog').filter({ hasText: '分配套餐' })
  await planDialog.locator('.el-select__wrapper').click()
  // 套餐名由真实后端给出（种子里的 free 套餐），不硬编码名字：选中后要求行内展示同一个名字。
  const planOption = page
    .getByRole('listbox', { name: '套餐' })
    .getByRole('option')
    .filter({ hasNotText: '取消套餐' })
    .first()
  const planName = (await planOption.innerText()).trim()
  await planOption.click()
  await planDialog.getByRole('button', { name: '保存' }).click()
  await expect(row).toContainText(planName)

  // 行内「删除」与确认框的确认按钮文案都是「删除」，确认按钮定位到 message box 内。
  await row.getByRole('button', { name: /更多操作/ }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await expect(page.getByTestId('tenants-table')).not.toContainText(tenantCode)
})

test('demo flow: tenant → plan → role → user → account security', async ({ page, request }) => {
  test.setTimeout(90_000)
  const suffix = Date.now().toString(36)
  const tenantCode = `e2e_${suffix}`
  const tenantName = `E2E 租户 ${suffix}`
  const roleName = `E2E 角色 ${suffix}`
  const username = `e2e_${suffix}`
  const userPassword = `E2e-${suffix}-2026`

  try {
    await loginAsAdmin(page)

    await openAdminPage(page, '租户管理', /\/admin\/tenants$/)
    await page.getByTestId('tenant-create').click()
    await page.getByLabel('租户编码').fill(tenantCode)
    await page.getByLabel('租户名称').fill(tenantName)
    await page.getByRole('button', { name: '创建' }).click()

    const tenantRow = page.getByRole('row', { name: new RegExp(tenantCode) })
    await expect(tenantRow).toBeVisible()
    await tenantRow.getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: '分配套餐', exact: true }).click()
    const planDialog = page.locator('.el-dialog').filter({ hasText: '分配套餐' })
    await planDialog.locator('.el-select__wrapper').click()
    const planOption = page
      .getByRole('listbox', { name: '套餐' })
      .getByRole('option')
      .filter({ hasNotText: '取消套餐' })
      .first()
    const planName = (await planOption.innerText()).trim()
    await planOption.click()
    await planDialog.getByRole('button', { name: '保存' }).click()
    await expect(tenantRow).toContainText(planName)

    await openAdminPage(page, '角色管理', /\/admin\/roles$/)
    await page.getByTestId('role-create').click()
    const roleDrawer = page.getByTestId('role-create-drawer')
    await roleDrawer.getByTestId('role-create-tenant').locator('.el-select__wrapper').click()
    await page.getByRole('option', { name: tenantName, exact: true }).click()
    await roleDrawer.getByTestId('role-create-name').fill(roleName)
    await roleDrawer.getByTestId('role-create-submit').click()
    await expect(page.getByTestId('roles-table')).toContainText(roleName)

    await openAdminPage(page, '用户管理', /\/admin\/users$/)
    await page.getByTestId('user-create').click()
    const userDrawer = page.getByTestId('user-create-drawer')
    await userDrawer.getByTestId('user-create-tenant').locator('.el-select__wrapper').click()
    await page.getByRole('option', { name: tenantName, exact: true }).click()
    await userDrawer.getByTestId('user-create-username').fill(username)
    await userDrawer.getByTestId('user-create-password').fill(userPassword)
    await userDrawer.getByTestId('user-create-roles').locator('.el-select__wrapper').click()
    await page.getByRole('option', { name: roleName, exact: true }).click()
    await page.keyboard.press('Escape')
    await userDrawer.getByTestId('user-create-submit').click()
    await expect(page.getByTestId('users-table')).toContainText(username)
    await expect(page.getByTestId('users-table')).toContainText(roleName)

    await openAdminPage(page, '账号安全', /\/admin\/account\/security$/)
    await expect(page.getByRole('heading', { name: '账号安全' })).toBeVisible()
    await expect(
      page.getByText('登录安全、MFA 和 Passkey 设置将在认证流程接入后启用。'),
    ).toBeVisible()
  } finally {
    await cleanupE2eData(request, { username, roleName, tenantCode })
  }
})
