/**
 * 后端业务错误码。只列出前端需要分支处理的取值，
 * 完整定义与分段规则以后端 jimu/internal/shared/errors/errors.go 为准。
 */
export const ErrorCode = {
  ok: 0,
  unknown: -1,
  invalidCredentials: 1006,
  rateLimited: 1007,
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
