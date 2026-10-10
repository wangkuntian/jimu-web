import { test, expect } from '@playwright/test'

test('visits the Jimu Portal shell', async ({ page }) => {
  await page.goto('/portal')

  await expect(page).toHaveTitle('Jimu Portal')
  await expect(page.getByRole('heading', { name: '平台工作区' })).toBeVisible()
})
