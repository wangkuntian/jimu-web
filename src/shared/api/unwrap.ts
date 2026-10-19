/**
 * 后端业务错误码。只列出前端需要分支处理的取值，
 * 完整定义与分段规则以后端 jimu/internal/shared/errors/errors.go 为准。
 */
export const ErrorCode = {
  ok: 0,
  unknown: -1,
  forbidden: 1003,
  internal: 1005,
  invalidCredentials: 1006,
  rateLimited: 1007,
  conflict: 1009,
  userExists: 2002,
  invalidPassword: 2003,
  mfaRequired: 2006,
  invalidMfa: 2007,
  captchaRequired: 4001,
  captchaInvalid: 4002,
} as const

/** 信封解包失败或后端返回业务错误时抛出。 */
export class ApiError extends Error {
  readonly code: number
  readonly requestId: string | undefined

  constructor(code: number, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.requestId = requestId
  }
}

/** 后端统一响应信封；字段可选，因为契约把它们都标为非必需。 */
export interface Envelope {
  code?: number | undefined
  message?: string | undefined
  request_id?: string | undefined
  data?: unknown
}

/**
 * 解出信封中的 data。
 *
 * 这是「响应体无类型」的唯一收敛点：组件不直接判断 code，
 * 也不直接消费 unknown。
 */
export function unwrap<T>(body: Envelope | undefined): T {
  if (body === undefined) {
    throw new ApiError(ErrorCode.unknown, '服务端返回了空响应')
  }
  if (body.code !== ErrorCode.ok) {
    throw new ApiError(body.code ?? ErrorCode.unknown, body.message ?? '请求失败', body.request_id)
  }
  if (body.data === undefined || body.data === null) {
    throw new ApiError(ErrorCode.unknown, '响应缺少 data 字段', body.request_id)
  }
  return body.data as T
}

/**
 * 解出「载荷型」端点的 data。
 *
 * 后端 swag 注解对这五个端点（/auth/login、/auth/refresh、/auth/me、/auth/config、
 * /auth/register）只标了载荷，生成的响应类型因此不含信封字段；运行时后端仍然返回
 * `{code, message, data, request_id}`。直接用 unwrap 会触发 TS 弱类型报错，
 * 这里显式接纳 `unknown`，形状校验仍然只有 unwrap 一份。
 */
export function unwrapPayload<T>(body: unknown): T {
  return unwrap<T>(body as Envelope | undefined)
}

/**
 * 只确认「操作成功」，不要求响应带 data。
 *
 * `response.OK(c, nil)` 的 Body.Data 是 `json:"data,omitempty"`，实测序列化为
 * `{"code":0,"message":"ok"}`——没有 data 键。PUT /tenants/{id}、DELETE /tenants/{id}、
 * PUT /tenants/{id}/plan 都是这一类，用 unwrap 会把成功判成「响应缺少 data 字段」。
 */
export function unwrapOk(body: unknown): void {
  const envelope = body as Envelope | undefined
  if (envelope === undefined) {
    throw new ApiError(ErrorCode.unknown, '服务端返回了空响应')
  }
  if (envelope.code !== ErrorCode.ok) {
    throw new ApiError(
      envelope.code ?? ErrorCode.unknown,
      envelope.message ?? '请求失败',
      envelope.request_id,
    )
  }
}
