# 认证基础设施与登录页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立会话层、API client、连接守卫与布局层，并交付一个能真实登录的登录页。

**Architecture:** 用 `openapi-fetch` 消费既有的 `paths` 类型做传输层，把「响应体无类型」收敛在 `shared/api/unwrap.ts` 一个出口；访问令牌驻留内存、refresh token 存 sessionStorage；刷新采用主动预刷新加 401 兜底，并发的多次刷新用单飞合并。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Vite 8、vue-router 5、Pinia 4、Element Plus 2.14、openapi-fetch 0.17、Vitest 5、Playwright 1.63。

**Spec:** [`docs/superpowers/specs/2026-10-10-jimu-portal-auth-design.md`](../specs/2026-10-10-jimu-portal-auth-design.md)

**范围说明：** 本文是计划一（基础设施 + 登录）。计划二为账号安全四个子页，计划三为注册与找回/重置密码。每个计划独立可交付、可验证。

## Global Constraints

- 包管理器为 `pnpm@11.23.0`，Node `>=22.13.0`；不生成 npm / Yarn lockfile。
- 单元测试放在 `tests/unit/**/*.spec.ts`（`vitest.config.ts` 的 `include` 已固定），环境为 jsdom；E2E 放在 `e2e/*.spec.ts`。
- `tsconfig` 开启 `verbatimModuleSyntax`、`isolatedModules`、`strict`、`noUncheckedIndexedAccess`。类型导入必须写 `import type` 或内联 `type`；数组与索引访问的结果是 `T | undefined`。
- 样式只用 `src/styles/main.css` 的 `--jp-*` 与 Element Plus 的 `--el-*` token，不写裸色值与裸字号；规范见 [`DESIGN.md`](../../DESIGN.md)。
- 不复制后端领域规则到前端；后端实体里的 `tenant_id` / `user_id` 只原样展示或忽略，不用于任何归属判断或请求构造。
- 改动 `src/`、`index.html`、`package.json` 时必须同步更新 `docs/releases/v0.2.0.md`。
- **禁止自动提交。** `AGENTS.md` 的「禁止自动提交」优先级最高。每个任务末尾的提交步骤**仅在用户明确指示提交时**执行；未获指示时，该任务以「运行检查并报告 diff」结束。
- 提交信息格式为 `type(scope): summary`，type 取 `feat|fix|docs|test|refactor|perf|ci|chore`，scope 为小写 kebab-case，summary 小写开头且不加句号；由 `githooks/commit-msg` 校验，regex 为 `^(type)\([a-z0-9][a-z0-9-]*\): [a-z0-9]`。
- 契约的 `servers` 为 `//localhost:8080/api/v1`（后端开发环境产物），**不可使用**；path 键不含 `/api/v1` 前缀。因此 `API_BASE_URL` 必须由 `window.location.origin` 组合出绝对 URL —— 相对 URL 在 Node 下 `new Request()` 会抛 `TypeError: Failed to parse URL`，单元测试将无法运行。
- `/api/v1/admin/error-codes` 与 `/api/v1/admin/ratelimit/auth` 两个端点在契约中自带前缀，与 servers 组合后会重复，**不可调用**。

---

### Task 1: 依赖、载荷窄接口与信封解包

**Files:**

- Modify: `package.json`
- Create: `src/shared/api/types.ts`
- Create: `src/shared/api/unwrap.ts`
- Test: `tests/unit/api-unwrap.spec.ts`

**Interfaces:**

- Consumes: 无（首个任务）
- Produces:
  - `TokenPair = { access_token: string; refresh_token: string; expires_in: number; device_token?: string }`
  - `Captcha = { captcha_id: string; captcha_image: string }`
  - `ErrorCode`（常量对象，含 `ok=0`、`unknown=-1`、`invalidCredentials=1006`、`rateLimited=1007`、`invalidPassword=2003`、`mfaRequired=2006`、`invalidMfa=2007`、`captchaRequired=4001`、`captchaInvalid=4002`）
  - `class ApiError extends Error`，字段 `code: number`、`requestId: string | undefined`
  - `unwrap<T>(body: Envelope | undefined): T`

- [ ] **Step 1: 安装依赖**

```bash
pnpm add openapi-fetch@^0.17.0
```

预期：`package.json` 的 `dependencies` 出现 `openapi-fetch`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 写失败的测试**

创建 `tests/unit/api-unwrap.spec.ts`：

```ts
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
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/api-unwrap.spec.ts`
预期：FAIL，报错指向无法解析 `../../src/shared/api/unwrap`。

- [ ] **Step 4: 写窄接口**

创建 `src/shared/api/types.ts`：

```ts
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
```

- [ ] **Step 5: 写解包实现**

创建 `src/shared/api/unwrap.ts`：

```ts
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
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/api-unwrap.spec.ts`
预期：PASS，5 个用例通过。

- [ ] **Step 7: 检查点**

```bash
pnpm run typecheck && pnpm run lint && pnpm exec prettier --check src/shared/api tests/unit/api-unwrap.spec.ts
```

- [ ] **Step 8: 提交（仅在用户明确指示提交时执行）**

```bash
git add package.json pnpm-lock.yaml src/shared/api/types.ts src/shared/api/unwrap.ts tests/unit/api-unwrap.spec.ts
git commit -m "feat(api): add openapi-fetch and the response envelope unwrapper"
```

---

### Task 2: 会话存储

**Files:**

- Create: `src/shared/auth/session.ts`
- Test: `tests/unit/auth-session.spec.ts`

**Interfaces:**

- Consumes: `TokenPair`（Task 1）
- Produces:
  - `getAccessToken(): string | null`
  - `getRefreshToken(): string | null`
  - `getDeviceToken(): string | null`
  - `hasSession(): boolean`
  - `isAccessTokenExpiring(withinMs?: number): boolean`（默认 60000）
  - `saveSession(tokens: TokenPair): void`
  - `clearSession(): void`
  - `clearDeviceToken(): void`

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/auth-session.spec.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearDeviceToken,
  clearSession,
  getAccessToken,
  getDeviceToken,
  getRefreshToken,
  hasSession,
  isAccessTokenExpiring,
  saveSession,
} from '../../src/shared/auth/session'

const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 1800,
}

describe('auth session', () => {
  beforeEach(() => {
    clearSession()
    clearDeviceToken()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('keeps the access token in memory and the refresh token in sessionStorage', () => {
    saveSession(tokens)

    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem('jimu.refresh_token')).toBeNull()
    expect(sessionStorage.getItem('jimu.access_token')).toBeNull()
  })

  it('keeps the device token across clearSession', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    clearSession()

    expect(getDeviceToken()).toBe('device-1')
    expect(getRefreshToken()).toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('drops the device token only when explicitly cleared', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    clearDeviceToken()

    expect(getDeviceToken()).toBeNull()
  })

  it('does not overwrite an existing device token when the response omits it', () => {
    saveSession({ ...tokens, device_token: 'device-1' })

    saveSession(tokens)

    expect(getDeviceToken()).toBe('device-1')
  })

  it('reports the access token as expiring inside the safety window', () => {
    expect(isAccessTokenExpiring()).toBe(false)

    saveSession({ ...tokens, expires_in: 30 })
    expect(isAccessTokenExpiring()).toBe(true)

    saveSession({ ...tokens, expires_in: 3600 })
    expect(isAccessTokenExpiring()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/auth-session.spec.ts`
预期：FAIL，无法解析 `../../src/shared/auth/session`。

- [ ] **Step 3: 写实现**

创建 `src/shared/auth/session.ts`：

```ts
import type { TokenPair } from '../api/types'

const REFRESH_TOKEN_KEY = 'jimu.refresh_token'
const DEVICE_TOKEN_KEY = 'jimu.device_token'

/** 访问令牌只驻留内存：页面刷新后靠 refresh token 恢复，不落盘。 */
let accessToken: string | null = null
/** 访问令牌的绝对到期时间（毫秒时间戳）。 */
let expiresAt = 0

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY)
}

/** 是否具备可恢复的会话。只判断 refresh token 是否存在，不代表访问令牌仍然有效。 */
export function hasSession(): boolean {
  return getRefreshToken() !== null
}

/** 访问令牌是否将在 withinMs 毫秒内到期。 */
export function isAccessTokenExpiring(withinMs = 60_000): boolean {
  return accessToken !== null && Date.now() >= expiresAt - withinMs
}

export function saveSession(tokens: TokenPair): void {
  accessToken = tokens.access_token
  expiresAt = Date.now() + tokens.expires_in * 1000
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  if (tokens.device_token !== undefined && tokens.device_token !== '') {
    localStorage.setItem(DEVICE_TOKEN_KEY, tokens.device_token)
  }
}

/**
 * 清理会话。
 *
 * 设备令牌代表「记住此设备」，跨登出保留；只有全设备登出（logout-all）时才用
 * clearDeviceToken 一并清除，因为后端此时已吊销全部可信设备。
 */
export function clearSession(): void {
  accessToken = null
  expiresAt = 0
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/auth-session.spec.ts`
预期：PASS，5 个用例通过。

- [ ] **Step 5: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 6: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/shared/auth/session.ts tests/unit/auth-session.spec.ts
git commit -m "feat(auth): add the session store"
```

---

### Task 3: API 前缀、client 与请求上下文中间件

**Files:**

- Create: `src/shared/api/config.ts`
- Create: `src/shared/api/client.ts`
- Test: `tests/unit/api-client.spec.ts`

**Interfaces:**

- Consumes: `getAccessToken()`（Task 2）、`paths`（`src/shared/api/generated.ts`，已存在）
- Produces:
  - `API_BASE_URL: string`（形如 `http://localhost:3000/api/v1`）
  - `api`（`openapi-fetch` client 实例，泛型为 `paths`）
  - `requestContextMiddleware: Middleware`

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/api-client.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../src/shared/api/client'
import { clearSession, saveSession } from '../../src/shared/auth/session'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({ code: 0, data: [] })
      }),
    )
  })

  it('uses an absolute api prefix so Node can parse the URL', async () => {
    await api.GET('/auth/devices')

    expect(requests[0]).toBeDefined()
    expect(new URL(requests[0]!.url).pathname).toBe('/api/v1/auth/devices')
  })

  it('sends the access token when a session exists', async () => {
    saveSession({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 1800 })

    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('omits the Authorization header without a session', async () => {
    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('Authorization')).toBeNull()
  })

  it('reports the stored device token on the login request only', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')

    await api.POST('/auth/login', { body: { username: 'alice', password: 'secret123' } })
    await api.GET('/auth/devices')

    expect(requests[0]!.headers.get('X-Device-Token')).toBe('device-1')
    expect(requests[1]!.headers.get('X-Device-Token')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/api-client.spec.ts`
预期：FAIL，无法解析 `../../src/shared/api/client`。

- [ ] **Step 3: 写配置与 client**

创建 `src/shared/api/config.ts`：

```ts
/**
 * API 前缀。
 *
 * 契约的 servers 是 `//localhost:8080/api/v1`（后端开发环境的 host + basePath），
 * 不能使用；path 键本身不含该前缀。
 *
 * 必须组成绝对 URL：openapi-fetch 走字符串拼接后调用 `new Request(url)`，
 * 相对 URL 在浏览器里能解析，但在 Node（单元测试环境）会抛
 * `TypeError: Failed to parse URL`。
 *
 * 开发环境由 Vite 代理 /api，生产环境同域反代，因此请求始终同源。
 */
export const API_BASE_URL = new URL('/api/v1', window.location.origin).toString()
```

创建 `src/shared/api/client.ts`：

```ts
import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'

import { getAccessToken } from '../auth/session'
import { API_BASE_URL } from './config'
import type { paths } from './generated'

export const api = createClient<paths>({ baseUrl: API_BASE_URL })

/**
 * 注入访问令牌与语言偏好。
 *
 * 同一实例的 onRequest / onResponse 收到的是同一个 Request 对象，
 * Task 5 的重试中间件依赖这一点按身份查找请求副本，因此这里
 * 只改 header 并原样返回，不构造新的 Request。
 */
export const requestContextMiddleware: Middleware = {
  onRequest({ request, schemaPath }) {
    const token = getAccessToken()
    if (token !== null) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }

    // 「记住此设备」的设备令牌只在登录时上报，用于跳过 TOTP。
    // 契约把它写在 loginRequest 的说明里而没有列为 header 参数（生成类型为
    // `header?: never`），因此无法通过 per-request 的 headers 选项传入，只能在此注入。
    if (schemaPath === '/auth/login') {
      const deviceToken = getDeviceToken()
      if (deviceToken !== null) {
        request.headers.set('X-Device-Token', deviceToken)
      }
    }

    request.headers.set('Accept-Language', navigator.language || 'zh-CN')
    return request
  },
}

api.use(requestContextMiddleware)
```

同时把文件顶部的 import 补齐：

```ts
import { getAccessToken, getDeviceToken } from '../auth/session'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/api-client.spec.ts`
预期：PASS，4 个用例通过。

- [ ] **Step 5: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 6: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/shared/api/config.ts src/shared/api/client.ts tests/unit/api-client.spec.ts
git commit -m "feat(api): add the typed client and request context middleware"
```

---

### Task 4: 单飞刷新

**Files:**

- Create: `src/shared/auth/refresh.ts`
- Test: `tests/unit/auth-refresh.spec.ts`

**Interfaces:**

- Consumes: `API_BASE_URL`（Task 3）、`TokenPair`（Task 1）、`getRefreshToken` / `saveSession` / `clearSession`（Task 2）
- Produces: `refreshAccessToken(): Promise<string | null>`（并发调用共享同一次请求；失败返回 `null` 并清理会话）

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/auth-refresh.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshAccessToken } from '../../src/shared/auth/refresh'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  hasSession,
  saveSession,
} from '../../src/shared/auth/session'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('refreshAccessToken', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns null without calling the api when there is no refresh token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores the new token pair and returns the new access token', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
        }),
      ),
    )

    await expect(refreshAccessToken()).resolves.toBe('new')
    expect(getAccessToken()).toBe('new')
    expect(getRefreshToken()).toBe('refresh-2')
  })

  it('merges concurrent calls into a single request', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                jsonResponse({
                  code: 0,
                  data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
                }),
              ),
            0,
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears the session when the refresh token is rejected', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1002, message: '未认证' }, 401)),
    )

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(hasSession()).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('clears the session when the envelope reports a business error', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1002, message: '未认证' })),
    )

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(hasSession()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/auth-refresh.spec.ts`
预期：FAIL，无法解析 `../../src/shared/auth/refresh`。

- [ ] **Step 3: 写实现**

创建 `src/shared/auth/refresh.ts`：

```ts
import { API_BASE_URL } from '../api/config'
import type { TokenPair } from '../api/types'
import { clearSession, getRefreshToken, saveSession } from './session'

interface RefreshEnvelope {
  code?: number | undefined
  data?: TokenPair | undefined
}

/** 进行中的刷新；并发调用共享它，避免刷新风暴与令牌互相覆盖。 */
let inflight: Promise<string | null> | null = null

/**
 * 刷新访问令牌。
 *
 * 这里刻意使用裸 `fetch` 而不是 openapi-fetch 的 client：刷新请求本身
 * 不能经过 401 重试中间件，否则会递归。
 */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (refreshToken === null) {
    return null
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // 网络错误不清理会话：可能只是离线，refresh token 仍然有效。
    return null
  }

  if (!response.ok) {
    clearSession()
    return null
  }

  const body = (await response.json()) as RefreshEnvelope
  if (body.code !== 0 || body.data === undefined) {
    clearSession()
    return null
  }

  saveSession(body.data)
  return body.data.access_token
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/auth-refresh.spec.ts`
预期：PASS，5 个用例通过。

- [ ] **Step 5: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 6: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/shared/auth/refresh.ts tests/unit/auth-refresh.spec.ts
git commit -m "feat(auth): add single-flight token refresh"
```

---

### Task 5: 401 重试中间件

**Files:**

- Modify: `src/shared/api/client.ts`
- Test: `tests/unit/api-retry.spec.ts`

**Interfaces:**

- Consumes: `api`、`requestContextMiddleware`（Task 3）、`refreshAccessToken`（Task 4）、`hasSession` / `isAccessTokenExpiring`（Task 2）
- Produces: `retryOnUnauthorizedMiddleware: Middleware`（注册到 `api`；负责发送前的主动预刷新与 401 后的一次重放）

**背景：** 已实测 `fetch(request)` 之后再调用 `request.clone()` 会抛 `TypeError: unusable`，因为请求体已被消费。因此必须在 `onRequest` 阶段克隆并暂存，`onResponse` 才能重试。已确认 openapi-fetch 在 `onRequest` 与 `onResponse` 之间传递的是同一个 `Request` 实例，且本中间件原样返回请求而不替换它，所以按对象身份查找成立。中间件顺序上本件注册在 `requestContextMiddleware` 之后，因此主动刷新后需要自行覆盖 `Authorization`。

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/api-retry.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../src/shared/api/client'
import { clearSession, getAccessToken, saveSession } from '../../src/shared/auth/session'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('retryOnUnauthorizedMiddleware', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('refreshes and replays the request with the new token on 401', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        const url = new URL(input.url)
        if (url.pathname.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        if (requests.length === 1) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 0, data: [{ id: 1 }] })
      }),
    )

    const result = await api.GET('/auth/devices')

    expect(result.response.status).toBe(200)
    expect(requestCount(requests, '/auth/devices')).toBe(2)
    expect(getAccessToken()).toBe('new')
    const replayed = requests.filter(
      (request) => new URL(request.url).pathname === '/api/v1/auth/devices',
    )
    expect(replayed[1]!.headers.get('Authorization')).toBe('Bearer new')
  })

  it('refreshes before sending when the access token is about to expire', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 30 })
    const paths: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        const path = new URL(input.url).pathname
        paths.push(path)
        if (path.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        return jsonResponse({ code: 0, data: [] })
      }),
    )

    await api.GET('/auth/devices')

    expect(paths).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/devices'])
    const devices = requests.find(
      (request) => new URL(request.url).pathname === '/api/v1/auth/devices',
    )
    expect(devices!.headers.get('Authorization')).toBe('Bearer new')
  })

  it('does not retry when the refresh fails, and surfaces the 401', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        if (new URL(input.url).pathname.endsWith('/auth/refresh')) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 1002, message: '未认证' }, 401)
      }),
    )

    const result = await api.GET('/auth/devices')

    expect(result.response.status).toBe(401)
    expect(requestCount(requests, '/auth/devices')).toBe(1)
  })

  it('replays a request that carries a body', async () => {
    saveSession({ access_token: 'old', refresh_token: 'refresh-1', expires_in: 1800 })
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        const url = new URL(input.url)
        if (url.pathname.endsWith('/auth/refresh')) {
          return jsonResponse({
            code: 0,
            data: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 1800 },
          })
        }
        bodies.push(await input.clone().text())
        if (bodies.length === 1) {
          return jsonResponse({ code: 1002, message: '未认证' }, 401)
        }
        return jsonResponse({ code: 0, data: {} })
      }),
    )

    const result = await api.POST('/auth/mfa/enable', { body: { code: '123456' } })

    expect(result.response.status).toBe(200)
    expect(bodies).toEqual(['{"code":"123456"}', '{"code":"123456"}'])
  })
})

function requestCount(requests: Request[], suffix: string): number {
  return requests.filter((request) => new URL(request.url).pathname === `/api/v1${suffix}`).length
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/api-retry.spec.ts`
预期：FAIL —— 401 未被重试，`requestCount(...)` 得到 1 而非 2。

- [ ] **Step 3: 写实现**

在 `src/shared/api/client.ts` 末尾追加（`api.use(requestContextMiddleware)` 之后）：

```ts
import { refreshAccessToken } from '../auth/refresh'

/**
 * 请求副本缓存。
 *
 * `fetch(request)` 会消费请求体，之后再 `request.clone()` 会抛
 * `TypeError: unusable`，因此必须在发出前留一份副本。
 */
const replayable = new WeakMap<Request, Request>()

/** 401 时刷新令牌并重放一次原请求。 */
export const retryOnUnauthorizedMiddleware: Middleware = {
  async onRequest({ request }) {
    // 主动预刷新：令牌即将到期时先换新，避免把必然失败的请求发出去。
    // 刷新失败不在这里中断，仍交由下面的 401 分支决定后续处理。
    if (hasSession() && isAccessTokenExpiring()) {
      const token = await refreshAccessToken()
      if (token !== null) {
        request.headers.set('Authorization', `Bearer ${token}`)
      }
    }

    // 副本必须在请求发出前留存（此时请求体尚未被消费）。
    replayable.set(request, request.clone())
    return request
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) {
      return response
    }

    const token = await refreshAccessToken()
    const replay = replayable.get(request)
    if (token === null || replay === undefined) {
      return response
    }

    // 显式设置新令牌，不依赖克隆时可能已过期的旧值。
    replay.headers.set('Authorization', `Bearer ${token}`)
    // 用裸 fetch 重放，避免再次进入中间件造成递归。
    return fetch(replay)
  },
}

api.use(retryOnUnauthorizedMiddleware)
```

同时把 `src/shared/api/client.ts` 顶部的 import 补为：

```ts
import { refreshAccessToken } from '../auth/refresh'
import { getAccessToken, getDeviceToken, hasSession, isAccessTokenExpiring } from '../auth/session'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/api-retry.spec.ts`
预期：PASS，4 个用例通过。

- [ ] **Step 5: 回归既有测试**

Run: `pnpm exec vitest run`
预期：全部通过；Task 3 的 api-client 用例不受影响。

- [ ] **Step 6: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 7: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/shared/api/client.ts tests/unit/api-retry.spec.ts
git commit -m "feat(api): retry once with a refreshed token on 401"
```

---

### Task 6: 认证 API 封装

**Files:**

- Create: `src/features/auth/api.ts`
- Test: `tests/unit/auth-api.spec.ts`

**Interfaces:**

- Consumes: `api`（Task 3）、`unwrap` / `ApiError` / `ErrorCode`（Task 1）、`TokenPair` / `Captcha`（Task 1）、`getDeviceToken` / `saveSession` / `clearSession` / `clearDeviceToken`（Task 2）
- Produces:
  - `fetchCaptcha(): Promise<Captcha>`
  - `login(payload: LoginPayload): Promise<TokenPair>`，`LoginPayload = { username: string; password: string; totp_code?: string; captcha_id?: string; captcha_code?: string; remember_device?: boolean }`
  - `logout(): Promise<void>`
  - `logoutAll(): Promise<void>`

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/auth-api.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCaptcha, login, logoutAll } from '../../src/features/auth/api'
import { clearSession, getAccessToken, getDeviceToken } from '../../src/shared/auth/session'
import { ApiError } from '../../src/shared/api/unwrap'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('auth api', () => {
  const requests: Request[] = []

  beforeEach(() => {
    requests.length = 0
    clearSession()
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns the captcha payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          data: { captcha_id: 'c1', captcha_image: 'data:image/png;base64,AA' },
        }),
      ),
    )

    await expect(fetchCaptcha()).resolves.toEqual({
      captcha_id: 'c1',
      captcha_image: 'data:image/png;base64,AA',
    })
  })

  it('saves the session on a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({
          code: 0,
          data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
        })
      }),
    )

    await login({ username: 'alice', password: 'secret123' })

    expect(getAccessToken()).toBe('a1')
    expect(JSON.parse(await requests[0]!.clone().text())).toEqual({
      username: 'alice',
      password: 'secret123',
    })
  })

  it('surfaces the business code so the login form can reveal the totp field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 2006, message: '需要 TOTP 验证码' })),
    )

    await expect(login({ username: 'alice', password: 'secret123' })).rejects.toMatchObject({
      code: 2006,
    })
    expect(getAccessToken()).toBeNull()
  })

  it('reports the stored device token on the login request', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        requests.push(input)
        return jsonResponse({
          code: 0,
          data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
        })
      }),
    )

    await login({ username: 'alice', password: 'secret123', remember_device: true })

    expect(requests[0]!.headers.get('X-Device-Token')).toBe('device-1')
  })

  it('clears the device token on logout-all', async () => {
    localStorage.setItem('jimu.device_token', 'device-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: {} })),
    )

    await logoutAll()

    expect(getDeviceToken()).toBeNull()
  })

  it('throws ApiError when the login envelope reports a business error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 1006, message: '认证信息无效' })),
    )

    await expect(login({ username: 'alice', password: 'bad' })).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/auth-api.spec.ts`
预期：FAIL，无法解析 `../../src/features/auth/api`。

- [ ] **Step 3: 写实现**

创建 `src/features/auth/api.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/auth-api.spec.ts`
预期：PASS，6 个用例通过。

- [ ] **Step 5: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 6: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/features/auth/api.ts tests/unit/auth-api.spec.ts
git commit -m "feat(auth): wrap the login, captcha and logout endpoints"
```

---

### Task 7: 布局层

**Files:**

- Create: `src/layouts/AuthLayout.vue`
- Create: `src/layouts/PortalLayout.vue`
- Modify: `src/App.vue`
- Test: `tests/unit/layouts.spec.ts`

**Interfaces:**

- Consumes: 无
- Produces: `AuthLayout`（居中卡片容器，`<slot />`）、`PortalLayout`（顶部导航 + `<slot />`，含退出登录按钮）

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/layouts.spec.ts`：

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AuthLayout from '../../src/layouts/AuthLayout.vue'
import PortalLayout from '../../src/layouts/PortalLayout.vue'

describe('layouts', () => {
  it('AuthLayout renders its slot inside a centered card', () => {
    const wrapper = mount(AuthLayout, { slots: { default: '<p>表单</p>' } })

    expect(wrapper.find('.auth-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('表单')
  })

  it('PortalLayout renders navigation and its slot', () => {
    const wrapper = mount(PortalLayout, {
      slots: { default: '<p>内容</p>' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Jimu Portal')
    expect(wrapper.text()).toContain('账号安全')
    expect(wrapper.text()).toContain('内容')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/layouts.spec.ts`
预期：FAIL，无法解析 `../../src/layouts/AuthLayout.vue`。

- [ ] **Step 3: 写 AuthLayout**

创建 `src/layouts/AuthLayout.vue`：

```vue
<template>
  <div class="auth-layout">
    <main class="auth-card">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--jp-color-app-bg);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}
</style>
```

- [ ] **Step 4: 写 PortalLayout**

创建 `src/layouts/PortalLayout.vue`：

```vue
<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { logout } from '../features/auth/api'

const router = useRouter()

async function onLogout(): Promise<void> {
  try {
    await logout()
  } finally {
    await router.push('/login')
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/portal">Jimu Portal</RouterLink>
      <nav class="primary-nav" aria-label="主导航">
        <RouterLink to="/portal">平台工作区</RouterLink>
        <RouterLink to="/workspace">业务工作区</RouterLink>
        <RouterLink to="/account/security">账号安全</RouterLink>
      </nav>
      <el-button text @click="onLogout">退出登录</el-button>
    </header>

    <main class="app-main">
      <slot>
        <RouterView />
      </slot>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 2rem;
  min-height: 64px;
  padding: 0 32px;
  background: var(--jp-color-surface);
  border-bottom: 1px solid var(--jp-color-hairline);
}

.brand {
  color: var(--jp-color-accent);
  font-size: 1.05rem;
  font-weight: 700;
  text-decoration: none;
}

.primary-nav {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 1.25rem;
  color: var(--jp-color-text-muted);
  font-size: 0.925rem;
}

.primary-nav a {
  text-decoration: none;
}

.primary-nav a.router-link-active,
.primary-nav a:hover {
  color: var(--jp-color-accent);
}

.app-main {
  width: min(100% - 48px, 1120px);
  margin: 0 auto;
  padding: 72px 0;
}

@media (max-width: 640px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 16px 24px;
  }

  .app-main {
    width: min(100% - 32px, 1120px);
    padding: 48px 0;
  }
}
</style>
```

- [ ] **Step 5: 让 App.vue 只保留路由出口**

将 `src/App.vue` 整体替换为：

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>
```

样式迁移：`PortalLayout.vue` 的 `scoped` 样式已接管应用外壳与顶部导航（见上一步），因此从 `src/styles/main.css` 中**删除以下内容**，避免全局规则与 scoped 规则重复：

- `.app-shell` 规则块
- `.app-header` 规则块
- `.brand` 规则块
- `.primary-nav`、`.primary-nav a`、`.primary-nav a.router-link-active`、`.primary-nav a:hover` 规则块
- `.app-main` 规则块
- 文件末尾的整个 `@media (max-width: 640px)` 块（其内容只有 `.app-header` 与 `.app-main` 两条覆盖，已随上述规则一并移入）

`main.css` 保留：`:root` 的设计 token、`*`、`body`、`a`、`.page-section`、`.eyebrow`、`h1`、`.page-lead`、`.page-note`、`.workspace-links`、`.workspace-link`、`.workspace-link:hover`。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/layouts.spec.ts`
预期：PASS，2 个用例通过。

- [ ] **Step 7: 回归全部单测与既有 E2E**

```bash
pnpm exec vitest run
```

预期：全部通过。注意 `tests/unit/App.spec.ts` 断言 `App` 渲染产品名与工作区入口 —— 这些文案已移入 `PortalLayout`，因此需同步改写该测试为挂载 `PortalLayout`：

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PortalLayout from '../../src/layouts/PortalLayout.vue'

describe('Jimu Portal shell', () => {
  it('shows the product name and workspace entry points', () => {
    const wrapper = mount(PortalLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.text()).toContain('Jimu Portal')
    expect(wrapper.text()).toContain('平台工作区')
    expect(wrapper.text()).toContain('业务工作区')
  })
})
```

- [ ] **Step 8: 检查点**

```bash
pnpm run check
```

- [ ] **Step 9: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/layouts src/App.vue src/styles/main.css tests/unit/layouts.spec.ts tests/unit/App.spec.ts
git commit -m "feat(portal): add the auth and portal layouts"
```

---

### Task 8: 路由表与连接守卫

**Files:**

- Create: `src/app/guards/session.ts`
- Modify: `src/app/router/index.ts`
- Test: `tests/unit/session-guard.spec.ts`

**Interfaces:**

- Consumes: `hasSession()`（Task 2）
- Produces:
  - `LOGIN_ROUTE = '/login'`、`DEFAULT_AUTHENTICATED_ROUTE = '/portal'`
  - `resolveSessionNavigation(to: { path: string; fullPath: string; meta: { public?: boolean } }): true | { path: string; query?: Record<string, string> }`
  - `sessionGuard: NavigationGuard`（`resolveSessionNavigation` 的适配器）

- [ ] **Step 1: 写失败的测试**

创建 `tests/unit/session-guard.spec.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { resolveSessionNavigation } from '../../src/app/guards/session'
import { clearSession, saveSession } from '../../src/shared/auth/session'

function route(path: string, isPublic = false) {
  return { path, fullPath: path, meta: isPublic ? { public: true } : {} }
}

describe('resolveSessionNavigation', () => {
  beforeEach(() => {
    clearSession()
    sessionStorage.clear()
  })

  it('allows public routes without a session', () => {
    expect(resolveSessionNavigation(route('/login', true))).toBe(true)
  })

  it('redirects to login and keeps the target path', () => {
    expect(resolveSessionNavigation(route('/account/security/devices'))).toEqual({
      path: '/login',
      query: { redirect: '/account/security/devices' },
    })
  })

  it('allows protected routes when a session exists', () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    expect(resolveSessionNavigation(route('/portal'))).toBe(true)
  })

  it('sends an authenticated user away from the login page', () => {
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    expect(resolveSessionNavigation(route('/login', true))).toEqual({ path: '/portal' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/session-guard.spec.ts`
预期：FAIL，无法解析 `../../src/app/guards/session`。

- [ ] **Step 3: 写守卫**

创建 `src/app/guards/session.ts`：

```ts
import type { NavigationGuard } from 'vue-router'

import { hasSession } from '../../shared/auth/session'

export const LOGIN_ROUTE = '/login'
export const DEFAULT_AUTHENTICATED_ROUTE = '/portal'

interface GuardTarget {
  path: string
  fullPath: string
  meta: { public?: boolean }
}

export type SessionNavigation = true | { path: string; query?: Record<string, string> }

/**
 * 会话导航判定。抽成纯函数以便直接测试，不依赖 router 实例。
 *
 * 登录状态只代表「存在 refresh token」，不代表访问令牌仍然有效；
 * 访问令牌是否可用由 API 层的刷新与重试负责。
 */
export function resolveSessionNavigation(to: GuardTarget): SessionNavigation {
  const authenticated = hasSession()

  if (authenticated && to.path === LOGIN_ROUTE) {
    return { path: DEFAULT_AUTHENTICATED_ROUTE }
  }

  if (!authenticated && to.meta.public !== true) {
    return { path: LOGIN_ROUTE, query: { redirect: to.fullPath } }
  }

  return true
}

export const sessionGuard: NavigationGuard = (to) => resolveSessionNavigation(to)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/session-guard.spec.ts`
预期：PASS，4 个用例通过。

- [ ] **Step 5: 更新路由表**

将 `src/app/router/index.ts` 替换为：

```ts
import { createRouter, createWebHistory } from 'vue-router'

import { sessionGuard } from '../guards/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../../features/auth/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/portal',
      name: 'portal',
      component: () => import('../../layouts/PortalLayout.vue'),
      children: [
        {
          path: '',
          name: 'portal-home',
          component: () => import('../../views/PortalView.vue'),
        },
        {
          path: '/workspace',
          name: 'workspace',
          component: () => import('../../views/WorkspaceView.vue'),
        },
        {
          path: '/account/security',
          name: 'account-security',
          component: () => import('../../views/AccountSecurityView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(sessionGuard)

export default router
```

- [ ] **Step 6: 检查点**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 7: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/app/guards/session.ts src/app/router/index.ts tests/unit/session-guard.spec.ts
git commit -m "feat(portal): guard routes by session state"
```

---

### Task 9: 登录页与端到端测试

**Files:**

- Create: `src/features/auth/views/LoginView.vue`
- Create: `tests/unit/login-view.spec.ts`
- Create: `e2e/login.spec.ts`

**Interfaces:**

- Consumes: `AuthLayout`（Task 7）、`login` / `fetchCaptcha`（Task 6）、`ApiError` / `ErrorCode`（Task 1）
- Produces: 登录路由组件（路径 `/login`）

**实现前：** 按 `AGENTS.md` 执行 UI/UX 规则检索，确认表单无障碍要求：

```bash
python3 "$HOME/.agents/skills/ui-ux-pro-max/scripts/search.py" "form validation error message" --domain ux
python3 "$HOME/.agents/skills/ui-ux-pro-max/scripts/search.py" "form password field" --stack vue
```

- [ ] **Step 1: 写失败的单测**

创建 `tests/unit/login-view.spec.ts`：

```ts
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import LoginView from '../../src/features/auth/views/LoginView.vue'

// 必须注册 Element Plus：el-form-item 的 label 由组件渲染，未注册时
// 只会得到未解析的自定义元素，label 文本不会出现在 wrapper.text() 中。
function mountLogin() {
  return mount(LoginView, {
    global: {
      plugins: [ElementPlus],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('LoginView', () => {
  it('renders visible labels, not placeholders', () => {
    const wrapper = mountLogin()

    expect(wrapper.text()).toContain('用户名')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).toContain('记住此设备')
  })

  it('hides the totp and captcha fields by default', () => {
    const wrapper = mountLogin()

    expect(wrapper.find('[data-test="totp"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="captcha"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/login-view.spec.ts`
预期：FAIL，无法解析 `LoginView.vue`。

- [ ] **Step 3: 写登录页**

创建 `src/features/auth/views/LoginView.vue`。要点：标签可见（不用占位符代替）、错误就近展示、提交按钮内联加载、TOTP 与验证码按错误码揭示。

```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchCaptcha, login } from '../api'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import AuthLayout from '../../../layouts/AuthLayout.vue'

const route = useRoute()
const router = useRouter()

const form = reactive({
  username: '',
  password: '',
  totpCode: '',
  captchaCode: '',
  rememberDevice: false,
})

const captchaImage = ref('')
const captchaId = ref('')
const needsTotp = ref(false)
const needsCaptcha = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

async function loadCaptcha(): Promise<void> {
  const captcha = await fetchCaptcha()
  captchaId.value = captcha.captcha_id
  captchaImage.value = captcha.captcha_image
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''

  try {
    await login({
      username: form.username,
      password: form.password,
      ...(needsTotp.value ? { totp_code: form.totpCode } : {}),
      ...(needsCaptcha.value
        ? { captcha_id: captchaId.value, captcha_code: form.captchaCode }
        : {}),
      remember_device: form.rememberDevice,
    })

    const redirect = route.query.redirect
    await router.push(typeof redirect === 'string' ? redirect : '/portal')
  } catch (error) {
    await handleError(error)
  } finally {
    submitting.value = false
  }
}

async function handleError(error: unknown): Promise<void> {
  if (!(error instanceof ApiError)) {
    errorMessage.value = '网络异常，请重试'
    return
  }

  switch (error.code) {
    case ErrorCode.mfaRequired:
      needsTotp.value = true
      errorMessage.value = '该账号启用了二次验证，请输入验证器中的 6 位验证码'
      return
    case ErrorCode.invalidMfa:
      errorMessage.value = '验证码无效，请重新输入'
      return
    case ErrorCode.captchaRequired:
      needsCaptcha.value = true
      await loadCaptcha()
      errorMessage.value = '请输入图形验证码'
      return
    case ErrorCode.captchaInvalid:
      await loadCaptcha()
      form.captchaCode = ''
      errorMessage.value = '验证码错误，请重新输入'
      return
    case ErrorCode.rateLimited:
      errorMessage.value = '尝试过于频繁，请稍后再试'
      return
    default:
      errorMessage.value = error.message
  }
}
</script>

<template>
  <AuthLayout>
    <h1 class="page-section">登录 Jimu Portal</h1>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="用户名">
        <el-input v-model="form.username" autocomplete="username" data-test="username" />
      </el-form-item>

      <el-form-item label="密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="current-password"
          data-test="password"
        />
      </el-form-item>

      <el-form-item v-if="needsTotp" label="二次验证码" data-test="totp">
        <el-input
          v-model="form.totpCode"
          inputmode="numeric"
          maxlength="6"
          autocomplete="one-time-code"
        />
      </el-form-item>

      <el-form-item v-if="needsCaptcha" label="图形验证码" data-test="captcha">
        <div class="captcha-row">
          <el-input v-model="form.captchaCode" autocomplete="off" />
          <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="captcha-image" />
        </div>
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.rememberDevice">记住此设备</el-checkbox>
      </el-form-item>

      <el-button type="primary" native-type="submit" :loading="submitting">登录</el-button>
    </el-form>
  </AuthLayout>
</template>

<style scoped>
.captcha-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.captcha-image {
  height: 32px;
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}
</style>
```

- [ ] **Step 4: 运行单测确认通过**

Run: `pnpm exec vitest run tests/unit/login-view.spec.ts`
预期：PASS，2 个用例通过。

- [ ] **Step 5: 写端到端测试**

创建 `e2e/login.spec.ts`。后端不可用时用 `page.route` 模拟响应。

```ts
import { test, expect } from '@playwright/test'

test('redirects an unauthenticated visitor to login and back after signing in', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
      }),
    })
  })

  await page.goto('/account/security')
  await expect(page).toHaveURL(/\/login\?redirect=/)

  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/account\/security$/)
})

test('reveals the totp field when the backend asks for a second factor', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/auth/login', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 2006, message: '需要 TOTP 验证码' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 },
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('secret123')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByLabel('二次验证码')).toBeVisible()
})

test('shows the backend message when credentials are rejected', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1006, message: '认证信息无效' }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('用户名').fill('alice')
  await page.getByLabel('密码').fill('wrong')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByText('认证信息无效')).toBeVisible()
})
```

- [ ] **Step 6: 运行端到端测试**

Run: `pnpm run test:e2e`
预期：新增 3 个用例与既有 `vue.spec.ts`、`design-tokens.spec.ts` 全部通过。

- [ ] **Step 7: 检查点**

```bash
pnpm run check
```

- [ ] **Step 8: 提交（仅在用户明确指示提交时执行）**

```bash
git add src/features/auth/views/LoginView.vue tests/unit/login-view.spec.ts e2e/login.spec.ts
git commit -m "feat(auth): add the login page with reactive captcha and totp"
```

---

### Task 10: 版本日志与目录约定同步

**Files:**

- Modify: `docs/releases/v0.2.0.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: 前九个任务的产出
- Produces: 无代码接口

- [ ] **Step 1: 更新版本日志**

在 `docs/releases/v0.2.0.md` 的「新增」中追加一条：

```markdown
- 认证与账号安全基础设施：`openapi-fetch` 传输层与统一信封解包、内存访问令牌 + `sessionStorage` 刷新令牌的会话层、单飞刷新与 401 重放、路由会话守卫，以及 `AuthLayout` / `PortalLayout` 两套布局；登录页按后端错误码逐步揭示图形验证码与 TOTP 字段。
```

在「说明」中追加：

```markdown
- 后端不提供 `/auth/me` 类端点，也不返回权限点，因此本期只按登录状态守卫，不做权限驱动的路由、导航与按钮判定。
- 契约响应体没有 schema，前端在 `src/shared/api/types.ts` 维护载荷视图模型，后端字段变化不会触发前端类型报错。
- 访问令牌驻留内存、刷新令牌存于 `sessionStorage`：关闭标签页需重新登录。这是后端不支持 HttpOnly Cookie 前提下的折中。
```

- [ ] **Step 2: 同步 README**

在 `README.md` 的「目录结构」中，把 `src/` 段落更新为包含新增目录：

```text
├── src/
│   ├── app/             # 应用路由与守卫
│   ├── features/        # 按用户能力组织的功能（auth：登录与账号安全）
│   ├── layouts/         # AuthLayout 与 PortalLayout
│   ├── shared/api/      # 生成的 API 类型、client、信封解包与载荷视图模型
│   ├── shared/auth/     # 会话存储与刷新
│   ├── stores/          # Pinia 状态
│   ├── styles/          # 全局样式与设计 token
│   └── views/           # 当前静态壳页面
```

在「验证方式」中追加：

```markdown
- Playwright 另覆盖：未登录访问受保护路由的重定向与登录后回跳、按错误码揭示 TOTP 字段、凭据被拒时的错误提示。
```

- [ ] **Step 3: 检查点**

```bash
pnpm exec prettier --check docs/releases/v0.2.0.md README.md
pnpm run check
pnpm run test:e2e
```

预期：全部通过。

- [ ] **Step 4: 提交（仅在用户明确指示提交时执行）**

```bash
git add docs/releases/v0.2.0.md README.md
git commit -m "docs(repo): record the auth infrastructure in v0.2.0 and the readme"
```

---

## 完成标准

- `pnpm run check` 与 `pnpm run test:e2e` 全部通过。
- 未登录访问 `/account/security` 会重定向到登录页并携带 `redirect`；登录成功后回到原路径。
- 后端返回 `2006` 时登录页出现 TOTP 字段，返回 `4001` 时出现图形验证码字段。
- 401 后自动刷新令牌并重放原请求一次；刷新失败时清理会话并回到登录页。
- 并发的多个 401 只触发一次刷新请求。
