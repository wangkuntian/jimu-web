import { test, expect } from '@playwright/test'

import { ADMIN_IDENTITY, seedSession, ZERO_ROLE_IDENTITY } from './helpers/session'

test('renders the authorized admin overview', async ({ page }) => {
  await seedSession(page)
  await page.goto('/admin')

  await expect(page).toHaveTitle('Jimu Hub')
  await expect(page.locator('.app-sidebar .brand-mark')).toBeVisible()
  await expect(page.locator('.sidebar-menu')).toBeVisible()
  await expect(page.locator('.primary-nav')).toHaveCount(0)
  await expect(page.locator('.topbar-current')).toHaveText('工作概览')
  await expect(page.locator('.topbar-user')).toHaveCount(0)
  await expect(page.locator('.topbar-actions')).toHaveCount(0)
  await expect(page.locator('[data-test="portal-status"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开账户菜单' })).toBeVisible()
  await expect(page.getByRole('button', { name: '退出登录' })).toHaveCount(0)
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main-content')
  await expect(page.locator('.sidebar-menu .el-menu-item.is-active')).toHaveText('工作概览')
  await expect(page.locator('.app-sidebar')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.workspace-feature')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.quick-panel')).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('heading', { name: '工作概览' })).toBeVisible()
  await expect(page.getByText('欢迎回来，admin')).toBeVisible()
  await expect(page.getByTestId('portal-role')).toHaveText('平台超级管理员')
  await expect(page.getByTestId('portal-permission-count')).toHaveText(
    String(ADMIN_IDENTITY.permissions.length),
  )
  await expect(page.getByTestId('quick-tenants')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '用户管理', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '角色管理', exact: true })).toBeVisible()
})

test('exposes a working skip navigation target', async ({ page }) => {
  await seedSession(page)
  await page.goto('/admin')

  const skipLink = page.getByRole('link', { name: '跳到主要内容' })
  await skipLink.focus()

  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()

  await skipLink.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

test('sends a zero-role user to the user workspace', async ({ page }) => {
  await seedSession(page, ZERO_ROLE_IDENTITY)
  await page.goto('/hub')

  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('heading', { name: '业务工作区' })).toBeVisible()
  await expect(page.locator('.topbar-current')).toHaveText('工作空间')
  await expect(page.getByRole('menuitem', { name: '账号安全', exact: true })).toBeVisible()
  await expect(page.getByTestId('quick-tenants')).toHaveCount(0)
})

test('keeps the admin overview without horizontal overflow on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedSession(page)
  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: '工作概览' })).toBeVisible()
  await expect(page.locator('.sidebar-menu .el-sub-menu')).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '账号安全', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
})

test('keeps the admin board in two columns at the review viewport', async ({ page }) => {
  await page.setViewportSize({ width: 822, height: 984 })
  await seedSession(page)
  await page.goto('/admin')

  const featureBox = await page.locator('.workspace-feature').boundingBox()
  const quickBox = await page.locator('.quick-panel').boundingBox()

  expect(featureBox).not.toBeNull()
  expect(quickBox).not.toBeNull()
  expect(quickBox!.x).toBeGreaterThan(featureBox!.x)
  await expect(page.locator('.topbar-brand')).toBeVisible()
  await expect(page.locator('.topbar-brand')).toHaveText('Jimu Hub')
  await expect(page.getByTestId('portal-role')).toHaveCSS('white-space', 'normal')
  await expect(page.locator('.account-trigger')).toBeVisible()
})

test('expands and collapses the sidebar from the topbar', async ({ page }) => {
  await page.setViewportSize({ width: 822, height: 984 })
  await seedSession(page)
  await page.goto('/admin')

  const sidebar = page.locator('.app-sidebar')
  const expandButton = page.getByRole('button', { name: '展开导航' })

  await expect(expandButton).toHaveAttribute('aria-expanded', 'false')
  expect((await sidebar.boundingBox())!.width).toBeLessThan(100)

  const firstMenuItem = page.locator('.sidebar-menu .el-menu-item').first()
  const firstMenuIcon = firstMenuItem.locator('.el-icon')
  const firstMenuBox = await firstMenuItem.boundingBox()
  const firstIconBox = await firstMenuIcon.boundingBox()

  expect(firstMenuBox).not.toBeNull()
  expect(firstIconBox).not.toBeNull()
  expect(
    Math.abs(
      firstIconBox!.x + firstIconBox!.width / 2 - (firstMenuBox!.x + firstMenuBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(1)

  await expandButton.click()

  const collapseButton = page.getByRole('button', { name: '收起导航' })
  await expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(200)
  await expect(page.locator('.sidebar-menu .el-menu-item').first()).toBeVisible()

  await collapseButton.click()
  await expect(page.getByRole('button', { name: '展开导航' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('opens account actions from the avatar menu', async ({ page }) => {
  await seedSession(page)
  await page.goto('/admin')

  await page.getByRole('button', { name: '打开账户菜单' }).click()

  const accountMenu = page.locator('.el-dropdown-menu')
  await expect(accountMenu.getByRole('menuitem', { name: '工作概览' })).toBeVisible()
  await expect(accountMenu.getByRole('menuitem', { name: '切换至用户工作区' })).toBeVisible()
  await expect(accountMenu.getByRole('menuitem', { name: '账号安全' })).toBeVisible()
  await expect(accountMenu.getByRole('menuitem', { name: '退出登录' })).toBeVisible()

  await accountMenu.getByRole('menuitem', { name: '账号安全' }).click()
  await expect(page).toHaveURL(/\/admin\/account\/security$/)
})
