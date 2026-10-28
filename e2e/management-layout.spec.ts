import { test, expect } from '@playwright/test'

import { ADMIN_IDENTITY, seedSession } from './helpers/session'

const tenant = {
  id: '1',
  code: 'default',
  name: '默认租户',
  status: 1,
  plan_id: '0',
  created_at: '2026-10-28T00:00:00Z',
  updated_at: '',
}
const rows = {
  tenants: tenant,
  users: {
    id: 'u1',
    username: 'alice',
    email: 'alice@example.com',
    phone: '',
    tenant: { id: '1', name: tenant.name },
    roles: [],
    status: 1,
    created_at: tenant.created_at,
    updated_at: '',
  },
  roles: {
    id: 'r1',
    tenant_id: '1',
    name: '运营管理员',
    description: '负责租户运营',
    code: '',
    scope: 'tenant',
    is_system: false,
    status: 1,
    created_at: tenant.created_at,
    updated_at: '',
  },
}

for (const domain of ['tenants', 'users', 'roles'] as const) {
  test(`${domain}: aligned filters, compact actions, right pager, and narrow layout`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await seedSession(page, {
      ...ADMIN_IDENTITY,
      permissions: [
        ...ADMIN_IDENTITY.permissions,
        { resource: '/api/v1/roles', action: 'POST' },
        { resource: '/api/v1/roles/*', action: 'PUT' },
        { resource: '/api/v1/roles/*', action: 'DELETE' },
      ],
    })
    await page.route(/\/api\/v1\/(tenants|users|roles|tenant-plans)(\?.*)?$/, (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').pop()
      const data = resource === 'tenant-plans' ? [] : [rows[resource as keyof typeof rows]]
      return route.fulfill({
        json: {
          code: 0,
          message: 'ok',
          data,
          total: resource === domain ? 141 : data.length,
          page: 1,
          page_size: 20,
        },
      })
    })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto(`/admin/${domain}`)
    await expect(page.getByTestId(`${domain}-table`)).toBeVisible()
    const filters = page.getByTestId(`${domain}-filters`)
    const controls = filters.locator('.el-input__wrapper, .el-select__wrapper')
    const positions = await controls.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().y),
    )
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1)
    await expect(page.locator('.management-heading-actions button')).toBeVisible()
    await expect(filters.getByRole('button', { name: /新建/ })).toHaveCount(0)
    const footer = (await page.locator('.management-footer').boundingBox())!
    const pager = (await page.getByTestId(`${domain}-pagination`).boundingBox())!
    expect(footer.x + footer.width - pager.x - pager.width).toBeLessThanOrEqual(1)
    await expect(page.getByTestId(`${domain}-pagination`)).toContainText('共 141 条')
    const actionRow = page.locator('.management-row-actions').first()
    await expect(actionRow.getByRole('button')).toHaveCount(2)
    const more = actionRow.getByRole('button', { name: /更多操作/ })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toBeVisible()
    await expect(page.getByRole('menu').getByRole('menuitem').first()).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`${domain}-desktop.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    await expect(page.getByRole('menu')).toBeHidden()
    for (const width of [1024, 768, 390, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
    }
    for (const control of await controls.all()) {
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThan(200)
    }
    const searchWidth = (await filters.getByRole('button', { name: '搜索' }).boundingBox())!.width
    const keywordWidth = (await controls.first().boundingBox())!.width
    expect(searchWidth).toBeGreaterThanOrEqual(keywordWidth)
    const previous = (await page
      .getByRole('button', { name: '上一页', exact: true })
      .boundingBox())!
    const next = (await page.getByRole('button', { name: '下一页', exact: true }).boundingBox())!
    expect(Math.abs(previous.y - next.y)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`${domain}-mobile.png`), fullPage: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(more).toBeVisible()
    const moreBox = (await more.boundingBox())!
    expect(moreBox.x).toBeGreaterThanOrEqual(0)
    expect(moreBox.x + moreBox.width).toBeLessThanOrEqual(375)
    for (let pageNumber = 2; pageNumber <= 8; pageNumber += 1) {
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(page.locator('.el-pager li.is-active')).toHaveText(String(pageNumber))
    }
    const currentPage = (await page.locator('.el-pager li.is-active').boundingBox())!
    const pagerWindow = (await page.locator('.el-pager').boundingBox())!
    expect(currentPage.x).toBeGreaterThanOrEqual(pagerWindow.x)
    expect(currentPage.x + currentPage.width).toBeLessThanOrEqual(pagerWindow.x + pagerWindow.width)
    expect(errors).toEqual([])
  })
}
