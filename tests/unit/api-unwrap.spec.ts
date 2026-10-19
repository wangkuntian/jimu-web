import { describe, expect, it } from 'vitest'

import {
  ApiError,
  ErrorCode,
  resolveEnvelope,
  unwrap,
  unwrapEnvelope,
  unwrapOk,
  unwrapPayload,
} from '../../src/shared/api/unwrap'

describe('resolveEnvelope', () => {
  it('reads data when the response is ok', () => {
    const envelope = { code: 0, message: 'ok', data: { id: 7 } }

    expect(
      resolveEnvelope({
        data: envelope,
        error: undefined,
        response: new Response(null, { status: 200 }),
      }),
    ).toBe(envelope)
  })

  it('reads error when the response is not ok', () => {
    // openapi-fetch 只在 2xx 写 data；403 的 {code:1003,...} 落在 error 里。
    const envelope = { code: ErrorCode.forbidden, message: '无权限', request_id: 'req-1' }

    expect(
      resolveEnvelope({
        data: undefined,
        error: envelope,
        response: new Response(null, { status: 403 }),
      }),
    ).toBe(envelope)
  })

  it('falls back to data when a non-2xx response carried no error body', () => {
    const envelope = { code: ErrorCode.unknown, message: '网关错误' }

    expect(
      resolveEnvelope({
        data: envelope,
        error: undefined,
        response: new Response(null, { status: 502 }),
      }),
    ).toBe(envelope)
  })

  it('returns undefined when neither channel carried a body', () => {
    expect(
      resolveEnvelope({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 204 }),
      }),
    ).toBeUndefined()
  })
})

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

describe('unwrapEnvelope', () => {
  it('returns the whole envelope so paginated callers keep total/page/page_size', () => {
    // /tenants 与 /tenant-plans 的分页元数据在信封的顶层，只取 data 会把它们丢掉。
    const envelope = {
      code: 0,
      message: 'ok',
      data: [{ id: 1 }],
      total: 1,
      page: 1,
      page_size: 20,
      request_id: 'req-4',
    }

    expect(unwrapEnvelope(envelope)).toBe(envelope)
  })

  it('throws the business error carried by the envelope', () => {
    expect(() =>
      unwrapEnvelope({ code: ErrorCode.forbidden, message: '无权限', request_id: 'req-5' }),
    ).toThrowError('无权限')
  })

  it('rejects a body that is not an envelope at all', () => {
    expect(() => unwrapEnvelope(undefined)).toThrowError('服务端返回了空响应')
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
