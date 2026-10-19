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

/** 后端统一响应信封；分页端点还会带 total/page/page_size（`contract.PageResponse` 同形）。 */
export interface Envelope {
  code?: number | undefined
  message?: string | undefined
  request_id?: string | undefined
  data?: unknown
  total?: number | undefined
  page?: number | undefined
  page_size?: number | undefined
}

/**
 * 取出「装着业务码的那个信封」。
 *
 * openapi-fetch 只在 2xx 把响应体写进 `data`；非 2xx 写进 `error`，`data` 是 undefined。
 * 后端在非 2xx 上同样返回统一信封：`1006`/`2006`/`2007` 走 401，`1003`/`5005` 走 403，
 * `1001`/`4001`/`4002`/`5004` 走 400，`2002`/`5003`/`5009` 走 409，`1007` 走 429。
 * 只读 `data` 会把真实业务码退化成「服务端返回了空响应」（unknown），
 * 登录/注册页的错误码分支与租户页的无权限/冲突状态就都分辨不出来。
 * 业务码判断仍然只在 unwrap / unwrapEnvelope / unwrapOk 里发生一次。
 */
export function resolveEnvelope(result: {
  data?: unknown
  error?: unknown
  response: Response
}): Envelope | undefined {
  return (result.response.ok ? result.data : (result.error ?? result.data)) as Envelope | undefined
}

/** 校验信封本身（非空 + code === 0），不做任何 data 形状判断。 */
function assertOk(body: Envelope | undefined): asserts body is Envelope {
  if (body === undefined) {
    throw new ApiError(ErrorCode.unknown, '服务端返回了空响应')
  }
  if (body.code !== ErrorCode.ok) {
    throw new ApiError(body.code ?? ErrorCode.unknown, body.message ?? '请求失败', body.request_id)
  }
}

/**
 * 解出信封中的 data。
 *
 * 这是「响应体无类型」的唯一收敛点：组件不直接判断 code，
 * 也不直接消费 unknown。
 */
export function unwrap<T>(body: Envelope | undefined): T {
  assertOk(body)
  if (body.data === undefined || body.data === null) {
    throw new ApiError(ErrorCode.unknown, '响应缺少 data 字段', body.request_id)
  }
  return body.data as T
}

/**
 * 校验信封本身并原样返回：分页端点需要 total/page/page_size，只取 data 会丢掉它们。
 * 调用方仍然只在这里判断 code，不在 feature 里重复错误处理。
 */
export function unwrapEnvelope<T extends Envelope>(body: T | undefined): T {
  assertOk(body)
  return body
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
  assertOk(body as Envelope | undefined)
}
