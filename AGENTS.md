# AGENTS.md

这是 Jimu Hub 前端仓库的协作规范。后端项目位于另一个独立的 `jimu` 仓库。

默认使用中文回复用户，除非用户明确要求使用其他语言。

## 仓库边界

- 本仓库名为 `jimu-web`，产品名为 `Jimu Hub`。
- 唯一包管理器为 `pnpm@11.23.0`；不生成或提交 npm、Yarn lockfile。
- 不直接修改后端仓库（本地默认位于 `../jimu`）；后端变更应在后端仓库中完成。
- 前后端通过 `contracts/jimu.swagger.yaml`、`contracts/jimu.openapi.yaml` 和 `contracts/backend-commit.txt` 关联。
- 不在前端复制后端领域规则或自行伪造租户标识。

## 禁止自动提交

未经用户明确指令，不执行 `git commit`、`git add` + `git commit`、`git push` 或任何创建 commit 的操作。包括但不限于：完成一个改动后自动提交、连续多个改动时自动分批提交、任何形式的「顺手提交」。

只有用户明确说「提交」、「commit」、「推送」等指令时才可以执行。此规则优先级最高，覆盖其他所有规范。

## 开发前必读

- 项目定位、技术栈、CLI 命令、目录结构和 OpenAPI 流程见 [README.md](README.md)；前端设计方向见 [Jimu Hub 前端设计（原 Jimu Portal 文档）](docs/superpowers/specs/2026-09-20-jimu-portal-design.md)。
- 设计 token、色板来源与 UI 规范见 [DESIGN.md](DESIGN.md)；选型理由与被否决的候选见[设计系统来源与 UI 规范](docs/superpowers/specs/2026-10-10-jimu-portal-design-system.md)。
- 分支、PR、CI、发布与版本日志流程见 [贡献指南](docs/CONTRIBUTING.md)；首次克隆后运行 `pnpm run hooks:install` 启用 commit-msg 钩子。
- 修改代码、脚本或目录约定后，必须同步更新 README.md 对应章节。
- 分支名沿用后端约定：`feature/<issue>-<slug>`，全小写短横线格式；`master` 有分支保护（`protect master`），只能经 PR 合入。
- 契约变更流程：替换 `contracts/jimu.swagger.yaml` → 更新 `contracts/backend-commit.txt` → 运行 `pnpm run api:types`。
- 需要后端领域规则（错误码分段、响应结构、归属模型、套餐与配额上限等）时查阅 `jimu` 仓库文档，不在本仓库复述。

## 架构约束

- 后端 HTTP 路由统一在 `/api/v1` 前缀下；身份与租户上下文由后端依据已验签凭证（JWT / API Key）解析，前端不参与解析。
- 前端不传租户标识（header、query、请求体都不传），不伪造、不推导、不缓存租户归属；租户范围与权限判定以服务端返回为准。
- 按用户能力组织界面：具体业务域确定后再建 `src/features/<domain>/`；`src/shared/` 只放确实被多个能力复用的内容。
- `src/shared/api/generated.ts` 由 `pnpm run api:types` 派生，是只读产物，不在其中添加手写业务逻辑。
- 首版只覆盖已确认的管理能力和通用工作区壳，不预先实现具体业务域，不虚构订单、库存、项目等业务。

## 设计系统

- 视觉取值的规范本体是 [DESIGN.md](DESIGN.md)（Carbon 来源）；色板、字号、间距和圆角以它为准，不在别处另行定义。
- 组件样式只用 `src/styles/main.css` 的 `--jp-*` 语义 token 和 Element Plus 的 `--el-*` 变量，不写裸色值和裸字号。
- `--el-*` 覆盖集中在 `src/styles/main.css`，依赖 `src/main.ts` 中 Element Plus 样式先于本项目引入；不要调整那两行的顺序，否则覆盖会静默失效。
- 改动 `--jp-color-accent` 时必须按 Element Plus 的 `mix` 规则同步重算 light-3/5/7/8/9 与 dark-2，否则 hover、disabled 和浅底状态会留在旧主色。
- UI/UX 规则查询用 `ui-ux-pro-max` 技能，且只允许定向检索：`python3 "$HOME/.agents/skills/ui-ux-pro-max/scripts/search.py" "<keyword>" --domain ux`（或用 `--stack vue`、`--domain chart`）。
- 禁止使用该技能的 `--design-system`：它输出的是营销首页结构和与本项目冲突的配色、字体，会直接覆盖上述规范。该技能为全局安装，`uipro update` 会覆盖其调用路径修补，更新后需重新修补。

## 简单优先

- 只实现当前需求，不预先实现具体业务域，不添加未被要求的功能、配置项、扩展点或抽象。
- 不为一次性代码创建接口、工厂或通用框架。
- 能删除本次改动造成的无用代码时直接删除。
- 不重构无关代码，不顺手改格式、命名或注释。
- 如果实现规模明显超过需求，先停下来简化方案。
- 遵循现有 Vue 3、TypeScript 和 Vite 结构。

## 保护工作区

- 修改前查看 `git status --short`。
- 不覆盖、回滚或格式化无关改动。
- 不运行 `git reset --hard`、`git checkout -- .` 或批量删除等破坏性命令，除非用户明确要求。
- 提交前再次查看 `git status --short`，只纳入当前任务相关文件。
- 如果无关本地改动影响当前任务，说明冲突并尽量绕开，不要替用户处置。

## Commit Message

使用 Conventional Commits 轻量格式 `type(scope): summary`。

- `type` 取 `feat` / `fix` / `docs` / `test` / `refactor` / `perf` / `ci` / `chore`。
- `scope` 必填，用受影响区域的小写短横线名（如 `repo`、`ci`、`actions`、`plans`、`api`、`portal`）；CI 相关改动可用 `ci(<area>)` 或 `chore(ci)`。
- summary 与正文全部使用英文：小写开头、祈使句、不加句号；不使用 `update code`、`fix bug` 这类无信息量 summary。
- 一个 commit 只包含一个清晰主题。

与后端仓库保持同一约定。由 `githooks/commit-msg` 强制检查（`pnpm run hooks:install` 安装，确需跳过用 `git commit --no-verify`），CI 的 `Policy` job 兜底。

## 质量门禁

- 代码改动先写聚焦测试，并先观察测试失败，再实现最小行为。
- 提交前运行 `pnpm run check`；它等价于 CI 的 `Quality & Tests` + `API Contract` + `Build`，`E2E` 用 `pnpm run test:e2e`。
- 改动产品代码（`src/`、`index.html`、`package.json`）时同步更新 `docs/releases/v<version>.md`，否则 CI 的 `Policy` job 失败。
- 修改 Swagger 契约时同步更新 `contracts/backend-commit.txt`，再运行 `pnpm run api:types`。
- 只改文档时至少运行 `pnpm exec prettier --check <file>`。
- 修改 workflow 时确认 `scripts/check_ci_gate.sh` 的 job 清单与适用标记同步更新（漏一个会让门禁静默失效）。
- 修改脚本、工具或目录约定时同步更新 `README.md`。

## 文档维护

- `README.md` 保留使用说明、参数和操作步骤。
- [贡献指南](docs/CONTRIBUTING.md) 是分支、PR、CI 与发布流程的事实依据；流程变化时同步更新它，不在 AGENTS.md 里复述细节。
- `docs/releases/<version>.md` 既是版本日志也是 GitHub Release body；改产品代码的 PR 必须同步更新。
- `docs/superpowers/` 下的文档带日期，是决策记录：方向变化时新增文档或追加说明，不静默改写历史结论。
- 不复制可从代码或契约派生的清单、数量和目录结构说明。

## CLI 命令

- `pnpm run dev`：启动开发服务器。
- `pnpm run fmt`：格式化源码。
- `pnpm run fmt:check`：检查格式但不修改文件。
- `pnpm run lint`：运行 ESLint。
- `pnpm run typecheck`：运行 `vue-tsc`。
- `pnpm run test`：运行 Vitest。
- `pnpm run test:e2e`：运行 Playwright。
- `pnpm run api:convert`：将固定的 Swagger 2.0 契约转换为 OpenAPI 3.0。
- `pnpm run api:types`：先转换契约，再生成 TypeScript 类型。
- `pnpm run api:check`：重新生成 API 派生文件并检查是否存在未同步差异。
- `pnpm run hooks:install`：将 `core.hooksPath` 指向 `githooks/`，启用 commit-msg 校验。
- `pnpm run build`：构建生产资源。
- `pnpm run check`：运行 API、格式、lint、类型、单测和构建检查。

## 回复格式

长任务中给出简洁进度，说明正在收集什么上下文、准备改什么、验证结果是什么。

最终回复包含：

- 改了什么。
- 跑了什么验证。
- 还有什么风险或未做事项。

## codebase-memory-mcp

本仓库已用 codebase-memory（tree-sitter 知识图谱 MCP）索引，项目名为 `Users-king-Documents-Projects-Mine-jimu-web`；索引存全局缓存，仓库内不落文件（`.codebase-memory/` 已 gitignore）。

规则：

- 遇到代码库结构问题（调用链 / 影响面 / 架构），优先用 MCP 工具查询，而不是逐文件 grep/read：`trace_path`（调用链）、`search_graph`（结构与语义搜索）、`get_architecture`（架构总览）、`detect_changes`（未提交改动的符号影响映射）、`query_graph`（Cypher 只读查询）、`get_code_snippet`（按限定名取源码）。
- 图谱未索引时先建索引：`index_repository`；之后 watcher 自动跟随 git 变更。
- 修改代码后无需手动刷新索引。
