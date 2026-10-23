import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { public_registration: true, provisioning_enabled: false },
      }),
    })
  })
})

test('renders registration in the shared auth shell with Carbon field states', async ({ page }) => {
  await page.goto('/register')

  await expect(page.locator('.auth-shell')).toBeVisible()
  await expect(page.locator('.brand-mark')).toBeVisible()
  await expect(page.locator('.brand-name')).toHaveText('Jimu Hub')
  await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible()
  await expect(page.getByLabel('用户名')).toBeVisible()
  await expect(page.getByText('4–20 位字母、数字或下划线')).toBeVisible()
  await expect(page.getByText('8–32 位且同时包含字母和数字')).toBeVisible()
  await expect(page.getByRole('link', { name: '返回登录' })).toBeVisible()

  const username = page.getByLabel('用户名')
  const usernameShell = page.locator('.auth-form .el-input__wrapper').first()

  await expect(usernameShell).toHaveCSS('box-shadow', 'rgb(224, 224, 224) 0px 0px 0px 1px inset')

  await username.focus()

  await expect(usernameShell).toHaveCSS('box-shadow', 'rgb(15, 98, 254) 0px 0px 0px 1px inset')
  await expect(usernameShell).toHaveCSS('outline', 'rgb(15, 98, 254) solid 2px')
})

test('stacks registration without horizontal overflow on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/register')

  const contextBox = await page.locator('.auth-context').boundingBox()
  const panelBox = await page.locator('.auth-panel').boundingBox()

  expect(contextBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(panelBox!.y).toBeGreaterThan(contextBox!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await expect(page.getByRole('button', { name: '完成注册' })).toHaveCSS('height', '44px')
})

test('keeps the captcha field inside the panel on a narrow viewport', async ({ page }) => {
  await page.route('**/api/v1/auth/register', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 4001, message: '需要图形验证码' }),
    })
  })
  await page.route('**/api/v1/captcha', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          captcha_id: 'c1',
          captcha_image:
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiIGZpbGw9IiNmNGY0ZjQiLz48L3N2Zz4=',
        },
      }),
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/register')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '完成注册' }).click()

  await expect(page.getByLabel('图形验证码')).toBeVisible()
  await expect(page.locator('.auth-captcha-image')).toHaveCSS('width', '120px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
})
