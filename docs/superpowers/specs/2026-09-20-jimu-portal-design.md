# Jimu Portal 前端设计

## 状态

已确认。本文档描述独立 `jimu-web` 仓库的首版前端方向，不包含具体业务域实现。

## 目标

- 为平台管理员、租户管理员和普通业务用户提供一个统一入口。
- 复用 Jimu 后端已有的认证、租户、RBAC、审计和 API Key 能力。
- 让平台工作区、租户工作区和业务工作区共享登录会话、导航壳和权限模型。
- 保持前后端独立发布，同时通过版本化 OpenAPI 契约降低接口漂移风险。
- 为后续具体业务模块提供可插拔的 `features/<domain>/` 扩展边界。

## 非目标

- 首版不实现订单、库存、项目、内容等具体业务域。
- 不创建第二套后端业务模型，不在前端复制领域规则。
- 不引入 SSR、BFF 或移动端独立应用。
- 不把后端所有能力一次性实现为页面；首版只覆盖已确认的管理能力和通用业务工作区壳。

## 命名

| 项目       | 决定                              |
| ---------- | --------------------------------- |
| Git 仓库   | `jimu-web`                        |
| 产品显示名 | `Jimu Portal`                     |
| 工作区     | `Platform`、`Tenant`、`Workspace` |
| 后端仓库   | `jimu`                            |

`Jimu Portal` 表示统一入口，避免使用 `jimu-admin` 这类会排除普通业务用户的名称。

## 仓库边界

`jimu` 负责 Go API、数据库迁移、后端部署和 OpenAPI 来源；`jimu-web` 负责页面、路由、权限展示、API client 和静态资源部署。两个仓库独立版本化、独立 CI 和独立发布。

前端仓库通过固定版本的 OpenAPI 文件消费后端契约：

```text
jimu-web/
└── contracts/
    ├── jimu.swagger.yaml
    ├── jimu.openapi.yaml
    └── backend-commit.txt
```

`backend-commit.txt` 记录契约对应的 `jimu` 提交。首版允许人工更新契约；后续可以由后端 Release artifact 或 CI 自动同步。前端不直接引用后端工作区路径。

## 技术架构

- Vue 3
- TypeScript
- Vite
- pnpm 11.23.0
- Composition API 和 `<script setup>`
- Vue Router
- Pinia
- TanStack Vue Query
- Element Plus
- `openapi-typescript` 生成 API 类型和 client 层输入
- Vitest、Vue Test Utils
- Playwright

Vue 3 适合当前以表格、表单、权限树和管理工作流为主的产品。性能不依赖框架默认行为，列表分页、虚拟滚动、请求缓存和路由级代码分割仍是必要优化。

## 目录设计

```text
jimu-web/
├── contracts/
├── public/
├── src/
│   ├── app/
│   │   ├── router/
│   │   ├── guards/
│   │   └── providers/
│   ├── layouts/
│   │   ├── AuthLayout.vue
│   │   └── PortalLayout.vue
│   ├── features/
│   │   ├── auth/
│   │   ├── platform/
│   │   ├── tenant/
│   │   ├── workspace/
│   │   └── audit/
│   ├── shared/
│   │   ├── api/
│   │   ├── components/
│   │   ├── permissions/
│   │   ├── composables/
│   │   └── utils/
│   ├── stores/
│   ├── styles/
│   └── main.ts
├── tests/
├── package.json
└── vite.config.ts
```

`features` 按用户能力组织，避免按后端技术层拆分成一个跨域的大型页面目录。`shared` 只放确实被多个能力复用的内容，具体业务逻辑留在对应 feature 内。

## 信息架构

```text
Jimu Portal
├── 登录与安全
│   ├── 登录
│   ├── 刷新会话
│   ├── MFA / Passkey
│   └── 账号安全
├── 平台工作区
│   ├── 租户管理
│   ├── 套餐与配额
│   └── 平台级系统状态
├── 租户工作区
│   ├── 用户管理
│   ├── 角色与权限
│   ├── API Key
│   └── 审计日志
└── 业务工作区
    ├── 工作台首页
    ├── 最近访问
    ├── 通知入口
    └── 预留业务模块导航
```

首版前端路由：

```text
/login
/portal
/platform/tenants
/platform/plans
/tenant/users
/tenant/roles
/tenant/permissions
/tenant/audit
/workspace
/account/security
```

这些是前端路由，不改变后端 `/api/v1` 路径。

## 权限模型

- 登录后根据后端返回的权限点决定默认工作区。
- 平台管理员可以访问平台工作区，并在被授权时查看租户工作区。
- 租户管理员只能管理当前租户范围内的资源。
- 普通用户进入业务工作区。
- 路由守卫、导航菜单、页面操作和按钮统一使用权限点判断。
- 前端不把角色名称硬编码成业务规则，也不自行拼接 `tenant_id` header 或 query 参数。
- 当前租户上下文遵循后端 JWT claim `tid`；前端不自行伪造租户标识。是否提供租户切换动作由后端认证契约决定；如果后端没有切换接口，前端不自行实现切换。

## 会话与数据流

1. 用户访问受保护路由，路由守卫检查本地会话状态。
2. 未登录时跳转 `/login`。
3. 登录成功后保存当前会话状态，加载用户身份、权限和可用工作区。
4. API client 统一注入访问令牌和 `Accept-Language`。
5. TanStack Vue Query 管理列表、详情、统计和缓存失效。
6. 切换工作区或租户后，按权限重新计算导航，并使受影响查询失效。
7. 退出或刷新失败时清理会话并回到登录页。

具体认证存储方式需要在实现阶段结合后端 refresh token 行为确认。默认不把长期 refresh token 直接放入 `localStorage`；若后端部署条件允许，优先使用 HttpOnly、SameSite Cookie。

## API 契约

- 后端 Swagger 2.0 原件固定在 `contracts/jimu.swagger.yaml`，转换后的 `contracts/jimu.openapi.yaml` 作为类型生成输入。
- 业务 feature 不直接散落 `fetch` 调用，统一通过 `shared/api` 和 feature service 访问。
- 生成文件和手写请求适配层分开，避免重新生成时覆盖业务处理。
- 前端记录契约对应的后端提交，接口变更需要更新兼容性说明。
- 开发环境由 Vite proxy 转发 `/api/v1`；生产环境使用同域反向代理，减少 CORS 和认证配置复杂度。

## 错误与加载状态

- `401`：尝试刷新会话；刷新失败则清理状态并回到登录页。
- `403`：显示无权限页面或禁用无权限操作，不误判为登录失效。
- `400`、`422`：将字段级校验错误绑定回表单，并保留后端错误码。
- 网络错误：显示统一可重试状态，不吞掉 trace 或请求上下文。
- 列表页面统一支持加载中、空状态、错误状态、分页、筛选和排序。
- 破坏性操作必须有确认流程，成功后使相关 Query 失效并刷新列表。

## 性能原则

- 路由级代码分割，平台、租户和业务工作区按需加载。
- 用户、审计日志等列表优先使用服务端分页和筛选。
- 大型权限树使用按需展开或虚拟滚动。
- 统计面板独立请求，避免首屏等待全部非关键数据。
- 使用 Query 缓存和请求去重，避免工作区切换造成重复请求。
- 不把大型领域数据树放入全局 Pinia 状态。

## 测试与交付

最低验证集：

- TypeScript 类型检查
- ESLint 和格式检查
- OpenAPI client 生成检查
- Vitest 单元测试
- 登录、刷新会话、租户切换和权限拒绝的 Playwright 流程
- 生产构建检查

首版端到端流程至少覆盖：

1. 登录成功并进入正确工作区。
2. 无权限用户无法打开受保护路由。
3. 租户管理员只能看到当前租户数据。
4. 会话过期后能刷新或回到登录页。
5. 普通用户进入业务工作区壳，而不是平台管理页面。

## 部署

生产环境推荐同域部署：

```text
https://portal.example.com/          # jimu-web 静态资源
https://portal.example.com/api/v1    # 反向代理到 jimu
```

`jimu-web` 独立构建静态资源，由 Nginx、CDN 或同类静态托管服务提供；后端继续由 `jimu` 自己部署和扩缩容。

## 风险与后续决策

- 当前后端没有具体业务域，因此业务工作区只能提供壳和扩展入口；后续新增业务域时应新增独立 feature，不修改平台和租户核心结构。
- refresh token 的最终存储方案取决于后端是否支持安全 Cookie，需要在认证实现前确认。
- OpenAPI 契约目前需要先采用人工同步，自动化同步属于后续 CI 改进，不阻塞首版前端。
- 真实部署域名、CI 平台和静态托管方式尚未确定，不影响本地开发架构。
