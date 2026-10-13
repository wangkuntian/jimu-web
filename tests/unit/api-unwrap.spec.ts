import { describe, expect, it } from 'vitest'

import { ApiError, ErrorCode, unwrap } from '../../src/shared/api/unwrap'

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
