# Jimu Portal 认证与账号安全设计

## 状态

已确认（2026-10-10）。本文描述 v0.2.0 的认证域与账号安全工作，是 [`2026-09-20-jimu-portal-design.md`](./2026-09-20-jimu-portal-design.md) 中信息架构下「登录与安全」部分的首次落地。

视觉取值以 [`DESIGN.md`](../../DESIGN.md) 为准，本文不重复设计 token。

> **（2026-10-12 补充）交付范围拆分。** 「目标」一节描述的是完整认证链路，实施时拆成三个计划：计划一（[`2026-10-10-auth-foundation-and-login.md`](../plans/2026-10-10-auth-foundation-and-login.md)）交付认证基础设施与登录页，即 v0.2.0 的范围；计划二承接账号安全四个子页；计划三承接注册与找回 / 重置密码。上文目标与非目标保持原样，仅在此记录拆分。

## 目标

- 打通端到端真实可用的认证链路：登录、会话刷新、登出、找回与重置密码、开通式注册。
- 交付账号安全页：可信设备、登录历史、MFA(TOTP) 开关、全设备登出，以及改密入口。
- 建立后续所有业务页面都要复用的基础设施：API client、会话层、路由守卫、布局层。
- 让前端在契约响应体无类型的现实下，仍有一处收敛点，避免 `unknown` 流进组件。

## 非目标

- 不做管理类页面（租户、套餐、用户、角色、权限、审计）。这些页面依赖尚未解决的权限来源问题，见「未决」。
- 不做通行密钥（WebAuthn）与 OAuth 第三方登录，两者均延后。
- 不做 API Key 页面：契约中不存在其管理端点。
- 不在前端实现任何权限、配额、归属或租户范围判定。

## 契约事实

以下事实来自对 `contracts/jimu.openapi.yaml` 与后端仓库 `jimu` 实现的实际核对，是本文所有决策的依据。

### 事实一：响应体全部无类型

契约的 schema 只覆盖请求体与三个通用信封（`response.Body`、`contract.PageResponse`、`contract.ErrorResponse`），**没有任何响应载荷 schema**。

- `response.Body.data` 与 `contract.PageResponse.data` 均渲染为 `unknown`。
- 信封字段本身有类型：`code`、`message`、`request_id`、`page`、`page_size`、`total`。
- 请求体、查询参数、路径参数完备且有说明。

### 事实二：token 只能存放在 JS 可访问的位置

- 登录返回 `contract.TokenPair`：`access_token`、`refresh_token`、`expires_in`，勾选「记住此设备」时另有 `device_token`。
- `/auth/refresh` 要求 `refresh_token` 出现在**请求体**中。
- 契约中全部端点均为 `cookie?: never`，后端没有基于 Cookie 的认证方案。
- 后端 CSRF 中间件（`internal/kernel/http/server.go`）仅在配置了 `csrf_secret` 时启用，且 **Bearer 认证请求自动跳过**，与本流程无关。

结论：前端必须自行持久化 refresh token，设计文档原先「优先 HttpOnly Cookie」的偏好当前无法实现。

### 事实三：验证码与 TOTP 由错误码驱动

后端 `internal/capabilities/auth/interfaces/handler.go` 的 `verifyCaptcha` 仅在 captcha 能力启用时校验，缺少时返回 `CodeCaptchaRequired(4001)`，无效时返回 `CodeCaptchaInvalid(4002)`。

后端 `internal/capabilities/auth/application/service.go` 的 `LoginWithTOTP` 注释明确：TOTP 码缺失返回 `CodeMFARequired(2006)`，码无效返回 `CodeInvalidMFA(2007)`；未启用 TOTP 时与普通登录等价。

结论：前端**不需要**猜测是否显示验证码或 TOTP，也不需要为此增加环境变量；按首次登录尝试返回的错误码逐步揭示即可。

### 事实四：缺少的三个端点

| 缺口               | 事实                                                                                            | 处置                            |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| 应用内改密         | 契约与后端均无改密端点，只有 `/auth/forgot-password` + `/auth/reset-password`（邮箱验证码流程） | 账号安全页只放引导入口          |
| 运行时配置发现     | 契约中无 `/config`、`/settings`、`/capabilities` 类端点                                         | 注册开关用构建期环境变量        |
| 当前用户身份与权限 | 无 `/auth/me` 类端点；`/permissions` 是权限目录 CRUD，非「我的权限」                            | v0.2.0 不做权限判定，见「未决」 |

### 事实五：注册受后端配置门控

`/auth/register` 仅当 `public_registration=true` 时可用。开通式注册（`auth.provisioning.enabled=true`）时 `tenant_name` **必填**，不传直接报参数错误；未启用开通式时忽略租户字段。前端无法在运行时发现这两个开关。

## 决策

| 决策               | 选择                       | 理由                                                                             |
| ------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| API 层             | `openapi-fetch@^0.17.0`    | 获得路径、方法、查询参数、请求体与信封的类型；与已有的 `openapi-typescript` 同源 |
| access token 存储  | 内存（Pinia）              | 短生命周期，不落盘                                                               |
| refresh token 存储 | `sessionStorage`           | 后端不支持 HttpOnly；关闭标签页即失效，优于 `localStorage`                       |
| device token 存储  | `localStorage`             | 「记住此设备」必须跨会话，否则该功能无意义                                       |
| 刷新策略           | 主动预刷新 + 被动 401 兜底 | 用 `expires_in` 提前刷新，同时保留 401 重试应对时钟漂移与提前吊销                |
| 账号安全页结构     | 左侧子导航 + 子路由        | 该页注定持续加能力（通行密钥、OAuth 绑定），需要可深链                           |
| 注册入口           | 构建期环境变量，默认关闭   | 后端开关不可查询，且内网管理台通常不需要公开注册                                 |

## 架构与目录

```text
src/
├── app/
│   ├── router/
│   └── guards/session.ts        # 会话守卫
├── shared/
│   ├── api/
│   │   ├── client.ts            # createClient<paths> + 中间件
│   │   ├── unwrap.ts            # 信封解包与错误抛出
│   │   ├── types.ts             # 手写载荷窄接口
│   │   └── generated.ts         # 只读派生（不变）
│   └── auth/
│       ├── session.ts           # token 读写
│       └── refresh.ts           # 单飞刷新
├── features/
│   ├── auth/                    # 登录、注册、找回、重置
│   └── account/                 # 账号安全
└── layouts/
    ├── AuthLayout.vue
    └── PortalLayout.vue
```

`shared/auth/` 为新增目录：会话逻辑被认证与账号安全两个 feature 共用，符合「`src/shared/` 只放确实被多个能力复用的内容」。

## 会话与刷新

### 存储

| 键            | 位置             | 生命周期                              |
| ------------- | ---------------- | ------------------------------------- |
| access token  | 内存             | 页面刷新即失效，靠 refresh token 恢复 |
| refresh token | `sessionStorage` | 标签页会话内                          |
| device token  | `localStorage`   | 长期，用户主动清除或设备被吊销时失效  |

### 刷新实现要点

1. **主动预刷新**：记录 `expires_in` 对应的绝对到期时间，在到期前约 60 秒触发刷新。
2. **被动兜底**：收到 401 时触发刷新并重试原请求一次。
3. **单飞**：并发的多个刷新请求共享同一个 Promise，避免刷新风暴与 token 互相覆盖。
4. **重试安全**：必须在 `onRequest` 阶段克隆并暂存原始请求（`WeakMap<Request, Request>`），`onResponse` 用副本重试。**已实测**：`fetch(req)` 之后 `req.clone()` 抛 `TypeError: unusable`，带请求体的接口（如 MFA 启用）无法就地重试。
5. **避免递归**：重试使用裸 `fetch`，不再经过中间件。
6. **防死循环**：刷新接口自身返回 401 时不再触发刷新，直接清理会话并跳转登录页。
7. **只重试一次**：重试后仍 401 则视为会话失效。

## 登录流程

登录页是一个按错误码逐步揭示字段的状态机，而不是一次性展示全部字段：

| 步骤 | 触发                             | 行为                                               |
| ---- | -------------------------------- | -------------------------------------------------- |
| 1    | 初始                             | 用户名 + 密码 + 「记住此设备」                     |
| 2    | 返回 `CodeCaptchaRequired(4001)` | 拉取 `/captcha` 显示图形验证码，要求补填后重试     |
| 3    | 返回 `CodeMFARequired(2006)`     | 显示 TOTP 输入框，保留用户名与密码，要求补填后重试 |
| 4    | 成功                             | 写入会话，跳转 `redirect` 参数或 `/portal`         |

其他错误码的处理：

| 错误码          | 含义                        | 界面行为                                   |
| --------------- | --------------------------- | ------------------------------------------ |
| `1006` / `2003` | 认证信息无效 / 密码错误     | 表单级错误提示，保留用户名                 |
| `2007`          | TOTP 验证码无效             | TOTP 字段就地报错                          |
| `4002`          | 验证码无效                  | 刷新验证码并要求重填                       |
| `1007`          | 请求过于频繁                | 提示稍后重试，禁用提交按钮直至限流窗口结束 |
| `2005`          | 重置码无效或过期            | 重置页提示重新发起找回                     |
| `2008` / `2009` | 新密码重复 / 出现在泄露集合 | 重置页字段级错误                           |

错误码取值来自后端 `internal/shared/errors/errors.go`。前端不维护完整错误码表，只对上述需要分支的码做处理，新增分支时查后端源。

## 路由与页面

```text
/login                        公开
/register                     公开，仅 VITE_AUTH_REGISTER 非 off 时注册
/forgot-password              公开
/reset-password               公开
/account/security             需登录，重定向到 devices
/account/security/devices     需登录
/account/security/history     需登录
/account/security/mfa         需登录
/account/security/password    需登录
/portal                       需登录
/workspace                    需登录
```

守卫行为：

- 未登录访问受保护路由 → 跳 `/login?redirect=<原路径>`，登录成功后回到该路径。
- 已登录访问 `/login` → 跳 `/portal`。
- 会话失效（刷新失败）→ 清理会话并跳登录页。

账号安全四个子页的职责：

| 子路由     | 内容                                                                           | 关键接口                                                                  |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `devices`  | 可信设备列表与单个注销；页面顶部提供「登出全部设备」破坏性操作                 | `GET /auth/devices`、`DELETE /auth/devices/{id}`、`POST /auth/logout-all` |
| `history`  | 登录历史分页列表，区分成功 / 失败 / 锁定                                       | `GET /auth/login-history?page&page_size`                                  |
| `mfa`      | TOTP 开关：setup 展示密钥与 otpauth、enable 用首次验证码确认、disable 需验证码 | `POST /auth/mfa/setup`、`/enable`、`/disable`                             |
| `password` | 不含改密表单，只说明改密需通过邮箱验证码并给出入口                             | 跳 `/forgot-password`                                                     |

「登出全部设备」放在 `devices` 页：后端说明登出全部设备会一并吊销全部可信设备，两者物理相关，且需在该操作旁说明这一后果。

## 响应类型策略

生成类型负责路径、方法、查询参数、请求体与信封；手写窄接口只负责 `data` 载荷，集中在 `shared/api/types.ts`。

| 窄接口             | 字段                                                                    | 来源                                                      |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `TokenPair`        | `access_token`、`refresh_token`、`expires_in`、`device_token?`          | `jimu/internal/contract/ports.go`                         |
| `Captcha`          | `captcha_id`、`captcha_image`（base64）                                 | `jimu/internal/capabilities/captcha/handler.go`           |
| `TrustedDevice`    | `id`、`label?`、`ip`、`user_agent`、`expires_at`、`last_used_at?`       | `jimu/internal/capabilities/mfa/domain/trusted_device.go` |
| `LoginHistoryItem` | `id`、`username`、`status`、`reason?`、`ip`、`user_agent`、`created_at` | `jimu/internal/capabilities/auth/domain/login_history.go` |
| `MfaSetup`         | `secret`、`otpauth_uri`                                                 | `jimu/internal/capabilities/mfa/interfaces/handler.go`    |

`status` 取值为 `success` / `failed` / `locked`（后端 `jimu/internal/contract/ports.go`）。

后端实体中的 `tenant_id`、`user_id` 会出现在响应里，前端**仅原样展示或忽略，不用于任何归属判断或请求构造**，符合「前端不传、不推导、不缓存租户归属」。

`unwrap()` 在统一出口做形状校验：`code` 非成功值或 `data` 缺少必需字段时抛出可读错误，避免 `unknown` 直接流向组件。窄接口是前端视图模型，不实现任何后端领域规则。

## 环境变量

| 变量                 | 取值                             | 默认  | 作用                                                      |
| -------------------- | -------------------------------- | ----- | --------------------------------------------------------- |
| `VITE_AUTH_REGISTER` | `off` / `plain` / `provisioning` | `off` | 是否注册 `/register` 路由，以及表单是否要求 `tenant_name` |

验证码与 TOTP 不设环境变量，完全由错误码驱动。

## 加载与错误状态

- 表单提交：按钮内联加载，禁用重复提交。
- 列表（可信设备、登录历史）：加载中、空状态、错误可重试、分页（登录历史）。
- 破坏性操作（注销设备、登出全部设备、关闭 MFA）：二次确认，确认文案说明后果。
- 网络错误：统一可重试提示，不吞掉 `request_id`。

## 测试策略

**Vitest**

- `unwrap()`：成功信封、业务错误码、`data` 形状异常三条分支。
- `session`：读写、清理、`sessionStorage` 与 `localStorage` 的分离。
- 刷新：单飞（并发 401 只发一次刷新）、防死循环（刷新接口 401 不再递归）、带请求体的请求重试使用克隆副本。
- 守卫：未登录重定向携带 `redirect`、已登录访问登录页重定向。

**Playwright**

- 登录成功进入 `/portal`；登录失败提示且保留用户名。
- 验证码开启时按 `4001` 揭示验证码并可完成登录（用拦截响应模拟）。
- TOTP 用户按 `2006` 揭示 TOTP 字段并可完成登录（用拦截响应模拟）。
- 未登录访问 `/account/security/devices` 被重定向到登录页并携带 `redirect`。
- 会话过期后自动刷新并继续当前页面。
- 账号安全页破坏性操作的二次确认。

**交付**

改动 `src/` 与 `package.json`，需同步更新 `docs/releases/v0.2.0.md`；交付前运行 `pnpm run check` 与 `pnpm run test:e2e`。

## 未决与风险

- **权限来源缺失**。设计文档的权限模型要求「登录后根据后端返回的权限点决定默认工作区」，但契约没有该数据源。v0.2.0 因此不做权限驱动的路由、导航与按钮判定，仅按登录状态守卫。补齐方式（后端加 `/auth/me` 或能力端点）需在后端仓库决策。
- **窄接口无契约保障**。响应字段靠后端源码与端点描述确定，后端改动不会触发前端类型报错。缓解：集中在一个文件、逐条注明来源、`unwrap()` 做形状校验；根本解法是后端补响应 schema。
- **注册入口依赖构建期开关**，与后端 `public_registration` / `auth.provisioning.enabled` 可能漂移。缓解：默认关闭，启用时由部署方确认后端配置。
- **`sessionStorage` 的取舍**。关闭标签页即需重新登录，是安全与体验的折中；用户可能期望更长的会话。若后续改为持久化，应同时评估 refresh token 的轮换与吊销。
- **改密体验割裂**。应用内无改密端点，用户改密必须走邮箱验证码；若后端补齐改密端点，应同步替换 `password` 子页。
- **`openapi-fetch` 的中间件递归风险**。重试必须走裸 `fetch`，否则会再次进入中间件。实现时需有测试覆盖。
- **（2026-10-12 更正）会话状态的落点。** 决策表把 access token 记为「内存（Pinia）」，实施时落在 `src/shared/auth/session.ts` 的模块级变量：刷新与路由守卫都在模块作用域消费它，不需要响应式 store。`src/stores/session.ts` 的占位 store 因全仓零引用已删除；会话状态以「架构与目录」一节的 `shared/auth/session.ts` 为准。

> **（2026-10-19 补充）注册入口的开关来源。** 决策表里「注册入口用构建期环境变量 `VITE_AUTH_REGISTER`」已被后端 v0.4.0 的 `GET /auth/config` 取代：运行时读取 `public_registration` / `provisioning_enabled`，关闭时隐藏入口并在 `/register` 渲染「注册未开放」，不再需要构建期变量（该变量从未实现，无迁移成本）。同时 `POST /auth/register` 的响应形状统一为 `{user, tenant?}`。
