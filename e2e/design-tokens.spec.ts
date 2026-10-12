import { test, expect } from '@playwright/test'

/**
 * 验证 Carbon 设计 token 已生效，见
 * docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md
 */
test('applies the Carbon design tokens over Element Plus', async ({ page }) => {
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
})

test('renders the shell with Carbon tokens', async ({ page }) => {
  await page.goto('/portal')

  await expect(page.locator('.brand')).toHaveCSS('color', 'rgb(15, 98, 254)')
})
