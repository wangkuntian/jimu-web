import { api } from '../../shared/api/client'
import type { Captcha, TokenPair } from '../../shared/api/types'
import { unwrap } from '../../shared/api/unwrap'
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

  const tokens = unwrap<TokenPair>(data)
  saveSession(tokens)
  return tokens
}

export async function logout(): Promise<void> {
  const { data } = await api.POST('/auth/logout')
  clearSession()
  unwrap<unknown>(data)
}

export async function logoutAll(): Promise<void> {
  const { data } = await api.POST('/auth/logout-all')
  clearSession()
  clearDeviceToken()
  unwrap<unknown>(data)
}
