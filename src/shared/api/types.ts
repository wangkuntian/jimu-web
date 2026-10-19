/**
 * 后端响应载荷的前端视图模型。
 *
 * 契约的响应体没有 schema（`response.Body.data` 与 `contract.PageResponse.data`
 * 都是空对象），字段名依据后端源码确定，来源见
 * docs/superpowers/specs/2026-10-10-jimu-portal-auth-design.md。
 * 后端改动不会触发前端类型报错，字段变化时必须同步这里。
 */

import type { components } from './generated'

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

// 以下契约 DTO 视图与上面的手写视图不同：它们从 `./generated` 派生，契约重新生成时会跟着变。
type Schemas = components['schemas']

/** 会话引导载荷；契约 application.MeView / application.MeUser / application.PermissionPoint。 */
export type IdentityUser = Required<Schemas['application.MeUser']>
export type PermissionPoint = Required<Schemas['application.PermissionPoint']>
export interface Identity {
  user: IdentityUser
  roles: string[]
  permissions: PermissionPoint[]
}

/** 认证开关；契约 interfaces.AuthConfigResponse。 */
export type AuthConfig = Required<Schemas['interfaces.AuthConfigResponse']>

/** 注册结果；契约 application.RegisterResponse（普通注册只有 user）。 */
export type RegisterUser = Required<Schemas['application.RegisterUserView']>
export type RegisterTenant = Required<Schemas['application.RegisterTenantView']>
export interface RegisterResult {
  user: RegisterUser
  tenant?: RegisterTenant
}

/** 租户；契约 application.TenantResponse。 */
export type Tenant = Required<Schemas['application.TenantResponse']>

/** 套餐；契约 application.PlanResponse。 */
export type Plan = Required<Schemas['application.PlanResponse']>
