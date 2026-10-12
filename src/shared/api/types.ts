/**
 * 后端响应载荷的前端视图模型。
 *
 * 契约的响应体没有 schema（`response.Body.data` 与 `contract.PageResponse.data`
 * 都是空对象），字段名依据后端源码确定，来源见
 * docs/superpowers/specs/2026-10-10-jimu-portal-auth-design.md。
 * 后端改动不会触发前端类型报错，字段变化时必须同步这里。
 */

/** 登录与刷新返回的令牌视图；来源 jimu/internal/contract/ports.go。 */
export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
  device_token?: string
}

/** 图形验证码；来源 jimu/internal/capabilities/captcha/handler.go。 */
export interface Captcha {
  captcha_id: string
  captcha_image: string
}
