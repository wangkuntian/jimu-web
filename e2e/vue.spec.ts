import { test, expect } from '@playwright/test'

import { seedSession } from './helpers/session'

test('visits the Jimu Portal shell', async ({ page }) => {
  await seedSession(page)
  await page.goto('/portal')

  await expect(page).toHaveTitle('Jimu Portal')
  await expect(page.getByRole('heading', { name: '平台工作区' })).toBeVisible()
})
