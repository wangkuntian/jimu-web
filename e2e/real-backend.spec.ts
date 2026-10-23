import { test, expect } from '@playwright/test'

/**
 * 真机联调：要求 ../jimu 的 compose 栈跑在 127.0.0.1:8080，并已完成结构种子。
 * 默认跳过（CI 上没有后端），本地用：
 *   E2E_REAL_BACKEND=1 E2E_ADMIN_PASSWORD=Admin12345 pnpm exec playwright test e2e/real-backend.spec.ts
 */
test.skip(process.env.E2E_REAL_BACKEND !== '1', '需要真实后端，见 README 的「本地真机联调」')

const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345'

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
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/hub$/)
  await page.getByTestId('hub-admin').click()
  await expect(page).toHaveURL(/\/admin$/)
  await page
    .locator('.sidebar-menu')
    .getByRole('menuitem', { name: '租户管理', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/tenants$/)
  // el-table 会渲染 header 与 body 两个 <table>，断言落在 data-test 的容器上。
  await expect(page.getByTestId('tenants-table')).toContainText('default')
})

test('create → assign plan → delete a runtime-created tenant', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const tenantCode = `e2e_${suffix}`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/hub$/)
  await page.getByTestId('hub-admin').click()
  await page
    .locator('.sidebar-menu')
    .getByRole('menuitem', { name: '租户管理', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/tenants$/)
  await expect(page.getByTestId('tenants-table')).toContainText('default')

  // 新建 → 改套餐 → 删除（删除走确认框）
  // 新建对话框的输入框没有 data-test 钩子，按 el-form-item 的 label 定位；提交按钮文案是「创建」。
  await page.getByTestId('tenant-create').click()
  await page.getByLabel('租户编码').fill(tenantCode)
  await page.getByLabel('租户名称').fill('联调租户')
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.getByTestId('tenants-table')).toContainText(tenantCode)

  const row = page.getByRole('row', { name: new RegExp(tenantCode) })
  await row.getByRole('button', { name: '分配套餐' }).click()
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
  await row.getByRole('button', { name: '删除' }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await expect(page.getByTestId('tenants-table')).not.toContainText(tenantCode)
})
