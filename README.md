# Jimu Hub

## 项目定位

Jimu Hub 是 Jimu 后端配套的独立前端项目，目标是为平台管理员、租户管理员和普通业务用户提供统一入口。

当前已建立 Vue 3 SPA、工程质量工具与认证基础：登录、会话刷新、路由守卫、会话引导（`/auth/me`）、运行时开关的注册页、双工作台分流，以及平台用户与租户管理均已接入真实后端；平台侧的套餐与配额、平台级系统状态尚未实现。用户工作区只提供可扩展的工作台壳，不虚构订单、库存、项目或内容等具体业务。

## 仓库边界

- `jimu-web`：页面、路由、权限展示、API client、前端测试和静态资源部署。
- `jimu`：Go API、数据库迁移、OpenAPI 来源和后端部署。
- 两个仓库独立版本化、独立 CI 和独立发布。
- 前端通过固定的 Swagger 2.0 契约生成 OpenAPI 3.0 文件并消费类型，`contracts/backend-commit.txt` 是契约 pin（`scripts/sync-contract.sh` 写入，CI 逐字节校验）。

## 技术栈

- Vue 3、TypeScript、Vite
- Vue Router、Pinia、TanStack Vue Query
- Element Plus、@lucide/vue
- Vitest、Vue Test Utils、Playwright
- ESLint、Prettier、openapi-typescript

## 前置条件

- Node.js 22.13+（`package.json` 的 `engines`；pnpm 11 自身要求 Node ≥22.13）
- pnpm 11.23.0（由 `packageManager` 固定）
- 可选：运行 E2E 测试时安装 Playwright Chromium 浏览器
- 本地 API 开发需要另行运行 `jimu` 后端，默认地址为 `http://localhost:8080`

## 快速开始

```bash
pnpm install
pnpm run api:types
pnpm run dev
```

开发服务器启动后访问 `http://localhost:5173`。Vite 会将 `/api` 请求代理到本地 Jimu 后端。

## 本地真机联调

默认的 E2E 全部打桩，不需要后端。要验证真实链路（会话引导、注册开关、租户管理），按下面的顺序把 `../jimu` 的 compose 栈跑起来。

### 前置

- Docker（OrbStack 或 Docker Desktop）已启动。
- `../jimu` 已克隆，且 `../jimu/.env` 与 `../jimu/secrets/*.txt` 就绪；缺 secrets 时先在 `../jimu` 运行 `make secrets`。
- `../jimu/docker-compose.yml` 把 server 映射到 `127.0.0.1:8080`，与 `vite.config.ts` 的 `/api → http://localhost:8080` 代理一致。
- 开发配置 `../jimu/configs/app.yaml` 为 `auth.public_registration: true`、`tenant.provisioning.enabled: false`，因此联调走**普通注册**（不创建租户）。

### 起后端

```bash
cd ../jimu
make compose-up                              # 启动 compose 栈，server 在 127.0.0.1:8080
make compose-migrate                         # 首次运行、库表还没建时必须先迁移
make compose-seed ADMIN_PASSWORD=Admin12345  # 结构种子：默认租户 + free 套餐 + 权限点 + 超级管理员角色 + admin
cd -
pnpm run dev                                 # 开发服务器 http://localhost:5173
```

`make compose-seed` 是幂等的，但**只在 `admin` 不存在时建号**：`admin` 已存在时它不会覆盖密码。此时要么用建号时的那个密码，要么删掉该账号后重新 seed。另外 `ADMIN_PASSWORD` 必须满足登录接口的校验 `min=8,max=32`，超长密码建出来的账号无法通过 `POST /auth/login`（返回 `1001 参数错误`）。

### 验收路径与当前结果

**注册（普通模式）→ 用新账号登录 → 用户工作区**与 **admin 登录 → 租户列表 → 新建 / 改套餐 / 删除**均已在真机上打通。后端 `cf116508ba73763edcf97599a9436628ce3969b1` 起把用户、租户和角色 ID 统一按 JSON string 输出，前端同步移除了旧的安全整数守卫；雪花 ID 不再经过 JavaScript `number`，行内动作会原样使用后端返回的字符串 ID。当前契约 pin 为 `78e22be43761ce3a67dea0ec05b75ab6fcba9323`，追加了平台角色管理、权限回显和字符串权限 ID。

### 权限前提

只有结构种子出来的 `admin` 有管理权限；**公开注册出来的用户零角色**——`GET /api/v1/auth/me` 返回 200 且 `roles`/`permissions` 都是空数组。零角色用户会进入 `/workspace`，直接访问 `/admin/*` 会被守卫送回用户工作区。管理面入口只由 `permissions` 决定：能读取 `/api/v1/users` 或 `/api/v1/tenants` 才显示；页面内再按具体资源和动作逐项判权。`403`（`1003`）渲染无权限态且留在当前页面，只有 `401` 才刷新凭证或回登录页。

### 可复现的端到端

```bash
E2E_REAL_BACKEND=1 E2E_ADMIN_PASSWORD=Admin12345 pnpm exec playwright test e2e/real-backend.spec.ts
```

`e2e/real-backend.spec.ts` 由 `E2E_REAL_BACKEND=1` 门控，默认跳过（CI 上没有后端）。两条用例均启用：一条真实注册 `e2e_<时间戳>` 账号，验证零角色进入用户工作区且访问管理面会被送回，再用 `admin` 确认租户列表渲染出真实的 `default` 行；另一条走「新建 → 分配套餐 → 删除」，使用新的字符串 ID 契约验证完整链路。

## CLI 命令

| 命令                     | 用途                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `pnpm run dev`           | 启动 Vite 开发服务器                                         |
| `pnpm run fmt`           | 使用 Prettier 格式化文件                                     |
| `pnpm run fmt:check`     | 检查格式但不修改文件                                         |
| `pnpm run lint`          | 运行 ESLint                                                  |
| `pnpm run typecheck`     | 运行 Vue TypeScript 类型检查                                 |
| `pnpm run test`          | 运行 Vitest 单元测试                                         |
| `pnpm run test:watch`    | 以监听模式运行 Vitest                                        |
| `pnpm run test:e2e`      | 运行 Playwright 端到端测试                                   |
| `pnpm run api:convert`   | 将固定的 Swagger 2.0 契约转换为 OpenAPI 3.0                  |
| `pnpm run api:types`     | 从 OpenAPI 契约生成 TypeScript 类型                          |
| `pnpm run api:check`     | 检查 OpenAPI 与 TypeScript 派生文件是否同步                  |
| `pnpm run hooks:install` | 安装 commit-msg 钩子（`git config core.hooksPath githooks`） |
| `pnpm run build`         | 执行类型检查并构建生产资源                                   |
| `pnpm run preview`       | 预览生产构建                                                 |
| `pnpm run check`         | 运行 API、格式、lint、类型、单测和构建检查                   |

提交前至少运行：

```bash
pnpm run check
```

## 开发流程

分支、提交消息、PR、CI 与发布的完整约定见[贡献指南](docs/CONTRIBUTING.md)。要点：

- `master` 有分支保护（规则集 `protect master`）：只能经 PR 合入，required check 是聚合检查 `CI Gate`，禁止强推与删除分支。
- 提交消息使用 Conventional Commits `type(scope): summary`；`pnpm run hooks:install` 启用本地钩子，CI 的 `Policy` job 兜底。
- 改动产品代码（`src/`、`index.html`、`package.json`）的 PR 必须同步更新 `docs/releases/v<version>.md`。
- 纯文档 PR 只跑 `Policy` 与 `CI Gate`，其余 job 显式跳过。
- 依赖更新由 dependabot 每周开 PR，不自动合并。

## OpenAPI 契约

后端提供的是 Swagger 2.0。前端把来源提交固定为 `contracts/backend-commit.txt` 中那行 40 位 SHA——这就是契约 pin——并把该提交的 `docs/openapi/swagger.yaml` 逐字节复制到 `contracts/jimu.swagger.yaml`。

同步契约走脚本，它是唯一入口：

```bash
scripts/sync-contract.sh                  # 取本地 ../jimu 的 HEAD（提交态，不是工作区）
scripts/sync-contract.sh <sha|tag|branch> # 从公开远端 fetch --depth=1 取该提交
```

脚本写回 `contracts/jimu.swagger.yaml` 与 `contracts/backend-commit.txt`，随后自动运行 `pnpm run api:types`。取「提交态」而不是工作区文件：后端仓库里未提交的本地改动不应该进契约副本；pin 也必须是**已推送**的提交，否则 CI 的 pin 校验会失败。`pnpm run api:convert` 只生成 `contracts/jimu.openapi.yaml`；通常直接运行 `pnpm run api:types`，它会先转换再生成 TypeScript 类型：

```bash
pnpm run api:types
```

生成文件 `src/shared/api/generated.ts` 只包含派生类型，不在其中添加手写业务逻辑。

CI 的 `API Contract` job 除 `pnpm run api:check` 外还运行 `scripts/check_contract_pin.sh`：它从公开仓 `fetch --depth=1` 取 pin 的 SHA，再与 `contracts/jimu.swagger.yaml` 逐字节比对。这一步只读、零凭据、fail-closed——pin 未推送时 fetch 直接失败，契约副本无法悄悄偏离来源提交。

后端 `/api/v1/admin/error-codes` 与 `/api/v1/admin/ratelimit/auth` 的重复 `basePath` 前缀已修正，生成路径不再重复 `/api/v1`；但这两条 console 能力尚未接通认证链，运行时仍返回 401，前端不消费。

## 当前 Bootstrap 范围

- `/` 重定向到 `/hub`。
- `/hub` 是多工作台选择入口；零角色用户直接进入 `/workspace`，管理员首次进入可选择用户工作区或管理控制台，之后恢复最近选择。
- `/workspace/*` 使用 `UserLayout`，`/admin/*` 使用 `PortalLayout`；所有受保护路由未登录时重定向到 `/login`，登录后优先回到原深链接。
- `/portal` → `/hub`、`/platform/tenants` → `/admin/tenants`、`/account/security` → `/workspace/account/security` 保留兼容重定向。
- 会话状态由 `src/shared/auth/session.ts` 的模块级变量承载：访问令牌只驻留内存，刷新令牌存 `sessionStorage`，不落盘，也不依赖 Pinia。
- 受保护导航前先做会话引导 `GET /auth/me`：身份（`roles`/`permissions`）只驻内存，成功才缓存；`401`/`404` 清会话回登录页，`500` 与网络错误不登出。
- 登录页、导航项、用户管理、角色管理与租户管理的行内动作都按 `permissions` 判权（Casbin `keyMatch` 的前端等价实现），代码里不出现角色名；`403`（`1003`）渲染无权限态且留在原路由，不触发登出。
- 注册入口由运行时 `GET /auth/config` 决定：`public_registration=false` 时登录页不显示入口，`/register` 渲染「注册未开放」；`provisioning_enabled=true` 才渲染租户字段。
- `/admin/tenants` 已接入真实后端：关键字/状态/排序筛选、分页、新建、编辑、分配套餐、删除（二次确认）；不筛选状态时请求**不含** `status` 参数。
- `/admin/users` 提供平台用户列表、用户名/租户/状态筛选、分页、新建、编辑、角色替换与停用；平台管理员创建时强制选择所属租户，角色只从目标租户加载，切换租户会清空已选角色。只有用户管理权限、没有租户列表权限的租户管理员创建时省略 `tenant_id`，由后端按当前身份确定租户。
- `/admin/roles` 提供平台角色列表、租户/名称/状态筛选、新建、编辑、停用和权限分配。权限抽屉按资源分组、支持搜索与整组勾选，保存时整体替换角色权限；空数组可清空全部权限。
- `/admin/users`、`/admin/roles` 与 `/admin/tenants` 共用 `src/shared/components/ManagementPage.vue`：页头、筛选卡片、加载/错误/空/无权限状态、表格表面和分页间距只有一份实现。
- Element Plus 已接入，主题变量按 Carbon 设计 token 覆盖；认证页、双工作台、用户管理、角色管理与租户管理均使用其菜单、表单、表格与提示组件。
- API 契约转换、类型生成、格式化、lint、类型检查、单测、E2E 和构建均有独立 CLI。

## 后续首版目标

```text
Platform
├── 用户管理
├── 角色管理
├── 租户管理
├── 套餐与配额
└── 平台级系统状态
Tenant
├── API Key
└── 审计日志
Workspace
├── 工作台首页
├── 最近访问
├── 通知入口
└── 业务模块扩展入口
```

以上是后续目标，不代表当前已经实现。具体业务域确定后，再建立 `src/features/<domain>/` 并接入后端。

## 目录结构

```text
jimu-web/
├── .github/            # CI 与发布 workflow、PR / issue 模板、dependabot
├── contracts/          # 固定的 Swagger 来源、OpenAPI 3 派生物和后端提交
├── docs/               # 贡献指南、版本日志、设计文档和实现计划
├── e2e/                # Playwright 端到端测试
├── githooks/           # commit-msg 提交消息钩子
├── scripts/            # 契约同步与 pin 校验、提交消息与聚合门禁校验脚本
├── src/
│   ├── app/             # 应用路由与守卫
│   ├── assets/          # 品牌标识等静态资源
│   ├── features/        # 按用户能力组织（auth、hub、users、roles、tenants）
│   ├── layouts/         # AuthLayout、UserLayout 与 PortalLayout
│   ├── shared/api/      # 生成的 API 类型、client、信封解包与载荷视图模型
│   ├── shared/auth/     # 会话存储与刷新
│   ├── shared/components/ # 管理台列表页等跨能力复用组件
│   ├── styles/          # 全局样式与设计 token
│   └── views/           # 当前静态壳页面
├── tests/               # Vitest 单元测试
├── DESIGN.md            # 设计规范（编码 agent 读取）
└── package.json
```

## 验证方式

- Vitest 覆盖信封解包（2xx 与真实非 2xx 业务码）、会话读写与单飞刷新、401 重试、路由守卫与会话失效跳转、工作台判定与最近选择持久化、用户/租户/角色/权限字符串 ID、登录页错误码分支、注册页开关与载荷、租户与角色列表 query 构造、用户查询与写操作、角色创建/编辑/停用、权限目录分页、角色权限回显与整体替换、共享管理页的状态与插槽契约，以及三张管理页的权限、四态、筛选与分页纠偏。
- Playwright 覆盖 `/hub` 分流与最近工作台恢复、管理面越权回退、旧路由重定向、管理员工作概览、用户工作区、可展开/收起且权限驱动的侧边栏、822px 双栏与窄屏单列布局，以及 Carbon 设计 token 是否按预期覆盖 Element Plus 默认值。
- Playwright 另覆盖：认证页品牌与表单状态、窄屏布局、未登录访问受保护路由的重定向与登录后回跳、按错误码揭示 TOTP 字段、凭据被拒时的错误提示、租户列表渲染、用户列表与创建/编辑/角色/停用交互、角色列表与权限分组分配，以及无权限（本地缺权限与后端 `403` 两种来源）渲染无权限页且留在当前页面。
- 真机链路（真实后端）由 `E2E_REAL_BACKEND=1` 门控，见「本地真机联调」；默认不跑也不需要在 CI 上跑。
- `pnpm run check` 是本地质量门禁；CI 把它拆成 `Quality & Tests`（node 22/24 矩阵）、`API Contract`、`Build` 三个并行 job，E2E 单列，最后由聚合检查 `CI Gate` 收口。

## 相关文档

- [贡献指南](docs/CONTRIBUTING.md)：分支、提交消息、PR、CI 与发布流程
- [版本日志 v0.1.0](docs/releases/v0.1.0.md)
- [Jimu Hub 前端设计（原 Jimu Portal 文档）](docs/superpowers/specs/2026-09-20-jimu-portal-design.md)
- [Jimu Hub 品牌命名与认证页调整](docs/superpowers/specs/2026-10-22-jimu-hub-brand-rename.md)
- [Jimu Hub 登录后导航框架](docs/superpowers/specs/2026-10-22-jimu-hub-workspace-navigation.md)
- [平台用户管理与双工作台设计](docs/superpowers/specs/2026-10-23-platform-user-management-design.md)
- [平台角色管理与权限分配](docs/superpowers/specs/2026-10-26-role-management.md)
- [设计规范 DESIGN.md](DESIGN.md)
- [设计系统来源与 UI 规范](docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md)
- [初始化实现计划](docs/superpowers/plans/2026-09-20-jimu-web-bootstrap.md)
