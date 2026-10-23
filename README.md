# Jimu Hub

## 项目定位

Jimu Hub 是 Jimu 后端配套的独立前端项目，目标是为平台管理员、租户管理员和普通业务用户提供统一入口。

当前已建立 Vue 3 SPA、工程质量工具与认证基础：登录、会话刷新、路由守卫、会话引导（`/auth/me`）、运行时开关的注册页和租户管理页已接入真实后端；平台侧的套餐与配额、平台级系统状态尚未实现。业务工作区只提供可扩展的工作台壳，不虚构订单、库存、项目或内容等具体业务。

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

**注册（普通模式）→ 用新账号登录 → 租户列表**在真机上可用；**新建 / 改套餐 / 删除对运行时创建的租户当前不可用**。原因是 P1 雪花 ID 精度：后端把雪花 ID 作为 JSON number 输出（真值 `370528943163310080`），超出 JS 的 `Number.MAX_SAFE_INTEGER`（`9007199254740991`）。`JSON.parse` 存下的 double 对这些值仍然**精确**（`BigInt(parsed)` 能原样往返），错位发生在把数字序列化回 URL 路径/请求体时——`String(number)` 给出的是「最短可往返十进制」，可以不是整数本身（`370528943163310080` 序列化成 `370528943163310100`），行内动作于是打到不存在的租户 ID 上（`PUT …/plan` 还会返回静默的 `code:0`）。根因与实测见[版本日志 v0.3.0](docs/releases/v0.3.0.md)「说明」的 P1 条目。这不是「只有 `default` 可以正常操作」：实测 13 次真机运行 12 次命中，往返不丢位的 ID（如 `370531811102556160`）仍能正常完成行内动作。为杜绝静默假成功，租户页现在对 ID 超出安全整数范围的行**禁用**「编辑 / 删除 / 分配套餐」三个行内按钮，并在页面顶部用 `el-alert` 说明原因（后端改为字符串序列化后自动恢复）。

### 权限前提

只有结构种子出来的 `admin` 有管理权限；**公开注册出来的用户零角色**——`GET /api/v1/auth/me` 返回 200 且 `roles`/`permissions` 都是空数组，但同一个 token 调 `GET /api/v1/tenants` 是 `403`（`1003`）。界面把 `403` 渲染成无权限页（「没有访问租户管理的权限」）并**留在 `/platform/tenants`**，这是设计语义，**不是会话失效**；只有 `401` 才刷新凭证或回登录页。判权只看 `permissions`，不看角色名。

### 可复现的端到端

```bash
E2E_REAL_BACKEND=1 E2E_ADMIN_PASSWORD=Admin12345 pnpm exec playwright test e2e/real-backend.spec.ts
```

`e2e/real-backend.spec.ts` 由 `E2E_REAL_BACKEND=1` 门控，默认跳过（CI 上没有后端）。它分两条用例：一条真实注册 `e2e_<时间戳>` 账号，验证零角色看不到「租户管理」入口、直达 `/platform/tenants` 得到无权限页并留在该路由，再用 `admin` 确认列表渲染出真实的 `default` 行；另一条走「新建 → 分配套餐 → 删除」，断言保持严格（不降级、不删除），但因为 P1 未修而**暂时整条跳过**——用例体首句是 `test.fixme(true, 'P1: …')`，测试体不执行，真机运行结果因此固定为 `1 passed / 1 skipped`。

第二条用例目前无法可靠通过：行内动作发出的 ID 被改写，套餐写入落到不存在的租户上，行内仍显示「未分配」。**跳过是确定性的**，与后端当次生成的 id 无关。上一轮曾用 Playwright 的 known-failure 标记 `test.fail(true, 'P1: …')` 跟踪同一缺陷，但该标记是否命中取决于当次生成的 id——实测 13 次真机运行 12 次命中，1 次因该 id 的最短十进制表示恰好等于自身而侥幸通过，那一次 Playwright 报 `Expected to fail, but passed` 并让套件退出码非 0，因此改用确定性的 `test.fixme`。行内动作现在还额外受安全整数检查保护（不可精确的 ID 按钮禁用），所以整条链路只能在后端把 `id` / `plan_id` 改为字符串序列化之后重新启用：同步契约（`scripts/sync-contract.sh <ref>`）→ `pnpm run api:types` → 按新类型收掉 `isPreciseId` 守卫 → 删掉 `test.fixme` 标记，届时断言应当真正通过。

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

- `/` 重定向到 `/portal`。
- `/portal`、`/workspace`、`/account/security` 和 `/platform/tenants` 均受会话守卫保护，未登录访问会重定向到 `/login`，登录后回到原路径。
- 会话状态由 `src/shared/auth/session.ts` 的模块级变量承载：访问令牌只驻留内存，刷新令牌存 `sessionStorage`，不落盘，也不依赖 Pinia。
- 受保护导航前先做会话引导 `GET /auth/me`：身份（`roles`/`permissions`）只驻内存，成功才缓存；`401`/`404` 清会话回登录页，`500` 与网络错误不登出。
- 登录页与导航项、租户页的行内动作都按 `permissions` 判权（Casbin `keyMatch` 的前端等价实现），代码里不出现角色名；`403`（`1003`）渲染无权限态且留在原路由，不触发登出。
- 注册入口由运行时 `GET /auth/config` 决定：`public_registration=false` 时登录页不显示入口，`/register` 渲染「注册未开放」；`provisioning_enabled=true` 才渲染租户字段。
- `/platform/tenants` 已接入真实后端：关键字/状态/排序筛选、分页、新建、编辑、分配套餐、删除（二次确认）；不筛选状态时请求**不含** `status` 参数。
- Element Plus 已接入，主题变量按 Carbon 设计 token 覆盖；登录、注册与租户页都使用其表单、表格与提示组件。
- API 契约转换、类型生成、格式化、lint、类型检查、单测、E2E 和构建均有独立 CLI。

## 后续首版目标

```text
Platform
├── 租户管理
├── 套餐与配额
└── 平台级系统状态
Tenant
├── 用户管理
├── 角色与权限
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
│   ├── features/        # 按用户能力组织的功能（auth：登录/注册与认证 API 封装）
│   ├── layouts/         # AuthLayout 与 PortalLayout
│   ├── shared/api/      # 生成的 API 类型、client、信封解包与载荷视图模型
│   ├── shared/auth/     # 会话存储与刷新
│   ├── styles/          # 全局样式与设计 token
│   └── views/           # 当前静态壳页面
├── tests/               # Vitest 单元测试
├── DESIGN.md            # 设计规范（编码 agent 读取）
└── package.json
```

## 验证方式

- Vitest 覆盖信封解包（2xx 与真实非 2xx 业务码）、会话读写与单飞刷新、401 重试、路由守卫与会话失效跳转、会话引导（`401`/`404` 清会话，`500`/网络错误不登出）、权限判定（只看 `permissions`，不看角色名）、登录页错误码分支、注册页开关与载荷、租户列表 query 构造（不筛选时不传 `status`）、租户 API 与租户页四态及逐行动作判权。
- Playwright 覆盖 `/portal` 工作概览、可展开/收起且权限驱动的侧边栏、管理员与零角色两种首页状态、822px 双栏与窄屏单列布局，以及 Carbon 设计 token 是否按预期覆盖 Element Plus 默认值。
- Playwright 另覆盖：认证页品牌与表单状态、窄屏布局、未登录访问受保护路由的重定向与登录后回跳、按错误码揭示 TOTP 字段、凭据被拒时的错误提示、租户列表渲染、无权限（本地缺权限与后端 `403` 两种来源）渲染无权限页且留在原路由。
- 真机链路（真实后端）由 `E2E_REAL_BACKEND=1` 门控，见「本地真机联调」；默认不跑也不需要在 CI 上跑。
- `pnpm run check` 是本地质量门禁；CI 把它拆成 `Quality & Tests`（node 22/24 矩阵）、`API Contract`、`Build` 三个并行 job，E2E 单列，最后由聚合检查 `CI Gate` 收口。

## 相关文档

- [贡献指南](docs/CONTRIBUTING.md)：分支、提交消息、PR、CI 与发布流程
- [版本日志 v0.1.0](docs/releases/v0.1.0.md)
- [Jimu Hub 前端设计（原 Jimu Portal 文档）](docs/superpowers/specs/2026-09-20-jimu-portal-design.md)
- [Jimu Hub 品牌命名与认证页调整](docs/superpowers/specs/2026-10-22-jimu-hub-brand-rename.md)
- [Jimu Hub 登录后导航框架](docs/superpowers/specs/2026-10-22-jimu-hub-workspace-navigation.md)
- [设计规范 DESIGN.md](DESIGN.md)
- [设计系统来源与 UI 规范](docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md)
- [初始化实现计划](docs/superpowers/plans/2026-09-20-jimu-web-bootstrap.md)
