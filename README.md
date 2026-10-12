# Jimu Portal

## 项目定位

Jimu Portal 是 Jimu 后端配套的独立前端项目，目标是为平台管理员、租户管理员和普通业务用户提供统一入口。

当前 Bootstrap 仅建立 Vue 3 SPA、三个静态工作区入口和工程质量工具；平台与租户管理能力尚未接入后端。业务工作区只提供可扩展的工作台壳，不虚构订单、库存、项目或内容等具体业务。

## 仓库边界

- `jimu-web`：页面、路由、权限展示、API client、前端测试和静态资源部署。
- `jimu`：Go API、数据库迁移、OpenAPI 来源和后端部署。
- 两个仓库独立版本化、独立 CI 和独立发布。
- 前端通过固定的 Swagger 2.0 契约生成 OpenAPI 3.0 文件并消费类型，`contracts/backend-commit.txt` 记录对应的后端提交。

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

后端提供的是 Swagger 2.0，前端将其固定副本保存在 `contracts/jimu.swagger.yaml`，并通过 `contracts/backend-commit.txt` 记录来源提交。`pnpm run api:convert` 只生成 `contracts/jimu.openapi.yaml`；通常直接运行 `pnpm run api:types`，它会先转换再生成 TypeScript 类型：

```bash
pnpm run api:types
```

生成文件 `src/shared/api/generated.ts` 只包含派生类型，不在其中添加手写业务逻辑。

当前后端 Swagger 源的 `/api/v1/admin/error-codes` 和 `/api/v1/admin/ratelimit/auth` 已包含 `basePath` 前缀，转换后存在重复 `/api/v1` 的风险。前端固定副本保持与后端来源一致；应在后端修复 Swagger 注解后重新同步，当前不要依赖这两个生成路径。

## 当前 Bootstrap 范围

- `/` 重定向到 `/portal`。
- `/portal`、`/workspace` 和 `/account/security` 提供真实的静态壳页面。
- Pinia 会话 store 只定义前端状态边界，不假设后端登录行为。
- Element Plus 已接入，主题变量按 Carbon 设计 token 覆盖，尚未使用其组件。
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
├── scripts/            # 提交消息与聚合门禁校验脚本
├── src/
│   ├── app/             # 应用路由
│   ├── shared/api/      # 生成的 API 类型
│   ├── stores/          # Pinia 状态
│   ├── styles/          # 全局样式
│   └── views/           # 当前静态壳页面
├── tests/               # Vitest 单元测试
├── DESIGN.md            # 设计规范（编码 agent 读取）
└── package.json
```

## 验证方式

- Vitest 当前验证产品名称和工作区入口。
- Playwright 当前验证 `/portal` 页面标题、平台工作区标题，以及 Carbon 设计 token 是否按预期覆盖 Element Plus 默认值。
- 登录、会话刷新、租户范围和无权限访问测试将在对应功能实现时补充。
- `pnpm run check` 是本地质量门禁；CI 把它拆成 `Quality & Tests`（node 22/24 矩阵）、`API Contract`、`Build` 三个并行 job，E2E 单列，最后由聚合检查 `CI Gate` 收口。

## 相关文档

- [贡献指南](docs/CONTRIBUTING.md)：分支、提交消息、PR、CI 与发布流程
- [版本日志 v0.1.0](docs/releases/v0.1.0.md)
- [Jimu Portal 前端设计](docs/superpowers/specs/2026-09-20-jimu-portal-design.md)
- [设计规范 DESIGN.md](DESIGN.md)
- [设计系统来源与 UI 规范](docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md)
- [初始化实现计划](docs/superpowers/plans/2026-09-20-jimu-web-bootstrap.md)
