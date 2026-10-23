import { test, expect } from '@playwright/test'

import { mockIdentity } from './helpers/session'

test('redirects an unauthenticated visitor to login and back after signing in', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
      }),
    })
  })
  // 登录后回跳受保护路由会触发会话引导，必须让 /auth/me 返回身份，否则会被弹回登录页。
  await mockIdentity(page)

  await page.goto('/account/security')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.locator('.brand-mark')).toBeVisible()
  await expect(page.locator('.brand-name')).toHaveText('Jimu Hub')
  await expect(page.getByText('统一访问入口')).toHaveCount(0)

  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/account\/security$/)
  // 回跳断言不能被一次「先到过目标路由又弹回登录页」满足。
  await expect(page).not.toHaveURL(/\/login/)
})

test('reveals the totp field when the backend asks for a second factor', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/auth/login', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 2006, message: '需要 TOTP 验证码' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByLabel('二次验证码')).toBeVisible()
})

test('shows the backend message when credentials are rejected', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1006, message: '认证信息无效' }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('wrong')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByText('认证信息无效')).toBeVisible()
})

test('uses Carbon borders and a visible focus ring on login fields', async ({ page }) => {
  await page.goto('/login')

  const username = page.getByLabel('用户名')
  const usernameShell = page.locator('.auth-form .el-input__wrapper').first()

  await expect(usernameShell).toHaveCSS('box-shadow', 'rgb(224, 224, 224) 0px 0px 0px 1px inset')

  await username.focus()

  await expect(usernameShell).toHaveCSS('box-shadow', 'rgb(15, 98, 254) 0px 0px 0px 1px inset')
  await expect(usernameShell).toHaveCSS('outline', 'rgb(15, 98, 254) solid 2px')
})

test('stacks the access entry without horizontal overflow on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  const contextBox = await page.locator('.auth-context').boundingBox()
  const panelBox = await page.locator('.auth-panel').boundingBox()

  expect(contextBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(panelBox!.y).toBeGreaterThan(contextBox!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await expect(page.getByRole('button', { name: '登录' })).toHaveCSS('height', '44px')
})
