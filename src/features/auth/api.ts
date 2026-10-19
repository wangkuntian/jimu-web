import { api } from '../../shared/api/client'
import type { AuthConfig, Captcha, RegisterResult, TokenPair } from '../../shared/api/types'
import { ApiError, ErrorCode, unwrap, unwrapPayload } from '../../shared/api/unwrap'
import { clearDeviceToken, clearSession, saveSession } from '../../shared/auth/session'

export interface LoginPayload {
  username: string
  password: string
  totp_code?: string
  captcha_id?: string
  captcha_code?: string
  remember_device?: boolean
}

export async function fetchCaptcha(): Promise<Captcha> {
  const { data } = await api.GET('/captcha')
  return unwrap<Captcha>(data)
}

export async function login(payload: LoginPayload): Promise<TokenPair> {
  const { data } = await api.POST('/auth/login', { body: payload })

  // /auth/login 的响应 schema 现在是 contract.TokenPair（载荷型标注），运行时仍是信封。
  const tokens = unwrapPayload<TokenPair>(data)
  saveSession(tokens)
  return tokens
}

export async function logout(): Promise<void> {
  try {
    const { data } = await api.POST('/auth/logout')
    unwrap<unknown>(data)
  } finally {
    clearSession()
  }
}

export async function logoutAll(): Promise<void> {
  try {
    const { data } = await api.POST('/auth/logout-all')
    unwrap<unknown>(data)
  } finally {
    clearSession()
    clearDeviceToken()
  }
}

export interface RegisterPayload {
  username: string
  password: string
  tenant_name?: string
  tenant_code?: string
  captcha_id?: string
  captcha_code?: string
}

/** 注册相关开关；公开端点，关闭公开注册时依然存在并返回 false。 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const { data } = await api.GET('/auth/config')
  return unwrapPayload<AuthConfig>(data)
}

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  const { data, response } = await api.POST('/auth/register', { body: payload })

  // 注册限流走 HTTP 429，响应体可能不是标准信封，先按状态归一化错误码。
  if (response.status === 429) {
    throw new ApiError(ErrorCode.rateLimited, '注册请求过于频繁，请稍后再试')
  }

  return unwrapPayload<RegisterResult>(data)
}
