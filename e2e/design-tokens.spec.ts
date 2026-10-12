import { test, expect } from '@playwright/test'

import { seedSession } from './helpers/session'

/**
 * 验证 Carbon 设计 token 已生效，见
 * docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md
 */
test('applies the Carbon design tokens over Element Plus', async ({ page }) => {
  await seedSession(page)
  await page.goto('/portal')

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    const read = (name: string) => styles.getPropertyValue(name).trim()

    return {
      // Element Plus 自带、本项目不覆盖的变量：用于证明其样式表已加载
      elColorWhite: read('--el-color-white'),
      elFontSizeBase: read('--el-font-size-base'),
      // 本项目按 Carbon 映射覆盖的变量
      primary: read('--el-color-primary'),
      primaryLight3: read('--el-color-primary-light-3'),
      textPrimary: read('--el-text-color-primary'),
      fillColorLight: read('--el-fill-color-light'),
      // DESIGN.md 第 3 节的字号层级（12 / 14 / 16 / 20 / 24px）与字重上限
      fontSizeCaption: read('--jp-font-size-caption'),
      fontSizeBody: read('--jp-font-size-body'),
      fontSizeSubtitle: read('--jp-font-size-subtitle'),
      fontSizeTitle: read('--jp-font-size-title'),
      fontSizeDisplay: read('--jp-font-size-display'),
      fontWeightEmphasis: read('--jp-font-weight-emphasis'),
    }
  })

  // Element Plus 样式已加载（否则下面的覆盖断言只是在验证自己的默认值）
  expect(tokens.elColorWhite).toBe('#fff')
  expect(tokens.elFontSizeBase).toBe('14px')

  // Carbon 主色覆盖了 Element Plus 默认的 #409eff
  expect(tokens.primary).toBe('#0f62fe')
  // 由主色派生的色阶必须一并重算，否则 hover / 浅底仍是默认蓝
  expect(tokens.primaryLight3).toBe('#5791fe')
  expect(tokens.textPrimary).toBe('#161616')
  expect(tokens.fillColorLight).toBe('#f4f4f4')

  // 字号只有 token 一处定义，组件不得再写裸字号
  expect(tokens.fontSizeCaption).toBe('12px')
  expect(tokens.fontSizeBody).toBe('14px')
  expect(tokens.fontSizeSubtitle).toBe('16px')
  expect(tokens.fontSizeTitle).toBe('20px')
  expect(tokens.fontSizeDisplay).toBe('24px')
  expect(tokens.fontWeightEmphasis).toBe('600')
})

test('renders the shell with Carbon tokens', async ({ page }) => {
  await seedSession(page)
  await page.goto('/portal')

  await expect(page.locator('.brand')).toHaveCSS('color', 'rgb(15, 98, 254)')
  // 品牌名走 16px 小节标题，字重封顶 600（DESIGN.md 不允许 700）
  await expect(page.locator('.brand')).toHaveCSS('font-size', '16px')
  await expect(page.locator('.brand')).toHaveCSS('font-weight', '600')
  await expect(page.locator('.primary-nav')).toHaveCSS('font-size', '14px')
})
