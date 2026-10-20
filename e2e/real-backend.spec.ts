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
  await page.getByRole('button', { name: '注册' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1/)
  await expect(page.getByText('注册成功')).toBeVisible()

  // 2) 注册出来的用户零角色：能登录、进得去外壳，但没有租户管理入口
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/portal$/)
  await expect(page.getByRole('link', { name: '租户管理' })).toHaveCount(0)
  await page.goto('/platform/tenants')
  await expect(page).toHaveURL(/\/platform\/tenants$/)
  await expect(page.getByText('没有访问租户管理的权限')).toBeVisible()

  // 3) admin 登录后看到真实列表。
  // 已登录用户会被会话守卫从 /login 弹回 /portal，所以先走真实登出再换账号。
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  await page.getByRole('link', { name: '租户管理' }).click()
  await expect(page).toHaveURL(/\/platform\/tenants$/)
  // el-table 会渲染 header 与 body 两个 <table>，断言落在 data-test 的容器上。
  await expect(page.getByTestId('tenants-table')).toContainText('default')
})

/**
 * P1 已知缺陷（后端，未在本轮修复）：`GET /tenants` 把雪花 ID 作为 JSON number 输出
 * （`"id":370528943163310080`），超出 JS 的 `Number.MAX_SAFE_INTEGER`（9007199254740991）；
 * JS 侧这个 id 的十进制形态是 `370528943163310100`（`JSON.parse(…).id` 取到的就是它，
 * 发回路径参数时也是它）。`TenantsView` 的行内动作都用 `row.id` 拼路径参数，于是真机上
 * 打的是不存在的租户 ID：服务端日志可见
 * `PUT /api/v1/tenants/370528943163310100/plan`，而该租户的真实 ID 是 `…080`。
 * 后端对该舍入 ID 的三种行为（实测）：`GET` → 404 `5001 租户不存在`；`DELETE` → 404 `5001`；
 * **`PUT …/plan` → `{"code":0,"message":"ok"}`**——最后一条是静默假成功，前端拿不到任何错误信号。
 * 只有种子租户 `default`（id=1）在安全整数范围内，行内动作才正常。
 * 该缺陷**数据相关、并非每次都命中**：实测 13 次真机运行 12 次命中（服务端日志里 PUT 路径
 * 的末几位被改写，真实 `…080` 发出的是 `…100`），1 次因该 id 的最短十进制表示恰好等于自身
 * 而侥幸成功。上一轮用 Playwright 的 known-failure 标记（`test.fail`）跟踪该缺陷，那次侥幸
 * 成功被报成「Expected to fail, but passed」并让套件退出码非 0——条件性标记因此换成确定性的
 * `test.fixme`：整条链路暂时跳过，与被测数据无关。
 * 下面的链路断言保持原样、不降级，只是暂时不执行；
 * 原始证据与根因见 docs/releases/v0.3.0.md「说明」的 P1 条目。
 */
test('P1: create → assign plan → delete a runtime-created tenant', async ({ page }) => {
  // 测试体首句：P1 修复前确定性跳过整条链路，不依赖后端当次生成的 id（known-failure 标记会翻转）。
  test.fixme(
    true,
    'P1: 后端把雪花 ID 作为 JSON number 输出（如 370528943163310080），超出 JS 的 Number.MAX_SAFE_INTEGER，浏览器拿到的数字被改写成 370528943163310100，行内动作（分配套餐 / 删除）于是打到不存在的租户上；行内动作现在还额外受安全整数检查保护（不可精确的 ID 按钮禁用），因此这条链路只能在后端把 id / plan_id 序列化为 JSON string（并同步契约）之后才能执行：删掉本行 test.fixme 即可重新启用整条链路。',
  )
  const suffix = Date.now().toString(36)
  const tenantCode = `e2e_${suffix}`

  await page.goto('/login')
  await page.getByLabel('用户名').fill('admin')
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  await page.getByRole('link', { name: '租户管理' }).click()
  await expect(page).toHaveURL(/\/platform\/tenants$/)
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
