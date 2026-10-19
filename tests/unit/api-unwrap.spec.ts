import { describe, expect, it } from 'vitest'

import { ApiError, ErrorCode, unwrap, unwrapOk, unwrapPayload } from '../../src/shared/api/unwrap'

describe('unwrap', () => {
  it('returns the payload when the envelope code is zero', () => {
    expect(unwrap<{ id: number }>({ code: 0, data: { id: 7 } })).toEqual({ id: 7 })
  })

  it('throws ApiError carrying the business code, message and request id', () => {
    let caught: unknown
    try {
      unwrap({ code: ErrorCode.mfaRequired, message: '需要 TOTP 验证码', request_id: 'req-1' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe(ErrorCode.mfaRequired)
    expect((caught as ApiError).message).toBe('需要 TOTP 验证码')
    expect((caught as ApiError).requestId).toBe('req-1')
  })

  it('falls back to a generic message when the envelope carries none', () => {
    expect(() => unwrap({ code: ErrorCode.rateLimited })).toThrowError('请求失败')
  })

  it('throws when data is missing', () => {
    expect(() => unwrap({ code: 0 })).toThrowError('响应缺少 data 字段')
  })

  it('throws when the envelope itself is missing', () => {
    expect(() => unwrap(undefined)).toThrowError('服务端返回了空响应')
  })
})

describe('unwrapPayload', () => {
  it('reads the payload out of the runtime envelope even though the contract annotates the payload itself', () => {
    // /auth/me 的响应 schema 是 application.MeView，运行时却是 {code,message,data,request_id}
    const body = {
      code: 0,
      message: 'ok',
      request_id: 'req-1',
      data: { user: { id: 1, username: 'admin' }, roles: [], permissions: [] },
    }

    expect(unwrapPayload<{ user: { id: number } }>(body)).toEqual({
      user: { id: 1, username: 'admin' },
      roles: [],
      permissions: [],
    })
  })

  it('throws the business error carried by the same envelope', () => {
    expect(() =>
      unwrapPayload({ code: ErrorCode.forbidden, message: '无权限', request_id: 'req-2' }),
    ).toThrowError('无权限')
  })
})

describe('unwrapOk', () => {
  it('accepts a success response whose data key was omitted', () => {
    // PUT /tenants/{id} 实测返回 {"code":0,"message":"ok"}，没有 data 键
    expect(() => unwrapOk({ code: 0, message: 'ok', request_id: 'req-3' })).not.toThrow()
  })

  it('still rejects a business error', () => {
    expect(() => unwrapOk({ code: ErrorCode.conflict, message: '租户编码已存在' })).toThrowError(
      '租户编码已存在',
    )
  })

  it('rejects a body that is not an envelope at all', () => {
    expect(() => unwrapOk(undefined)).toThrowError('服务端返回了空响应')
  })

  it('shows why unwrap cannot be used for these responses', () => {
    // 反向钉住：同一个响应体用 unwrap 会被误判成失败
    expect(() => unwrap({ code: 0, message: 'ok' })).toThrowError('响应缺少 data 字段')
  })
})
