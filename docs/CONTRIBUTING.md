# 贡献指南

感谢你愿意为 Jimu Portal 贡献力量。本文档是开发流程的事实依据；协作规范（给 AI agent 的约束）见 [AGENTS.md](../AGENTS.md)，项目结构与 CLI 见 [README.md](../README.md)。

## 开发环境

- Node.js `>=22.13.0`（`package.json` 的 `engines`；pnpm 11 自身要求 Node ≥22.13，Node 20 无法安装依赖）
- pnpm 11.23.0（由 `packageManager` 固定，唯一包管理器）
- 可选：本地运行 E2E 时安装 Playwright Chromium
- 可选：本地联调需要后端 `jimu` 运行在 `http://localhost:8080`

```bash
pnpm install
pnpm run hooks:install   # git config core.hooksPath githooks，启用 commit-msg 校验
pnpm run api:types       # 从固定契约生成 API 类型
pnpm run dev             # http://localhost:5173，/api 代理到本地后端
```

## 分支策略

采用简化 GitHub Flow：`master` 是唯一长期分支，**不接受直接 push**（分支保护规则 `protect master`，`bypass_actors` 为空，管理员同样不能绕过），所有改动经 PR 合入。

- `feature/<issue>-<slug>` — 新功能
- `fix/<issue>-<slug>` — 缺陷修复
- `hotfix/<issue>-<slug>` — 线上紧急修复
- `dependabot/*` — 自动化分支，人工不得基于它开发

分支名小写，单词用短横线，`slug` 不超过 5 个单词；`<issue>` 段鼓励填写（有 issue 时写成 `feature/123-<slug>`），没有 issue 时省略。CI、工具链、模板等仓库级改动同样走 `feature/`，与后端 `feature/ci-pipeline` 的用法一致；后端定义的 `release/*`、`dependency-updates` 两个长期分支在本仓不存在。

与后端 `jimu` 的差异：本仓没有 `release/*` 集成分支与常驻 `dependency-updates` 分支。发布直接在 `master` tip 打 tag；依赖更新由 dependabot 面向 `master` 开 PR（见下）。

## Commit 规范

Conventional Commits 轻量格式：

```
type(scope): summary
```

- `type` 取值：`feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`ci`、`chore`
- `scope` **必填**，用受影响区域的小写短横线名：`repo`、`ci`、`actions`、`plans`、`api`、`portal` 等
- summary 与正文全部使用英文：小写开头、祈使句、不加句号
- 一个 commit 只包含一个清晰主题；多行 commit 可在正文说明为什么与风险

```
feat(portal): add a tenant switcher to the portal header
fix(auth): reject an expired refresh token
```

由 `githooks/commit-msg` 强制检查（`pnpm run hooks:install` 安装；确需跳过用 `git commit --no-verify`），CI 的 `Policy` job 兜底。本地自查整段分支：

```bash
bash scripts/check_commit_messages.sh origin/master HEAD
```

钩子允许 `fixup!` / `squash!` / `amend!` 前缀（剥掉前缀后校验目标提交的消息），因此 `git commit --fixup=<sha>` 配合 `git rebase --autosquash` 可以正常使用；这些临时提交不应留在 PR 里。

## Pull Request

1. 分支推送后按 [PR 模板](https://github.com/wangkuntian/jimu-web/blob/master/.github/PULL_REQUEST_TEMPLATE.md) 填写变更说明、类型、检查清单与风险
2. 必须通过聚合检查 **`CI Gate`**（分支保护唯一 required 的检查名）
3. 分支保护为 `strict`：PR 合并前需与 `master` 同步（页面上的 `Update branch`，或本地 rebase 后强推自己的分支）
4. 不要求他人 approve（`required_approving_review_count: 0`），单人也能合并自己的 PR；有第二位贡献者后再收紧
5. 合并策略：feature/fix/hotfix 用 squash merge；合并后删除源分支

## CI 说明

`.github/workflows/ci.yml` 是唯一的质量管线：一个 `Changes` router 判断这次改动是不是纯文档，各领域 job 用 **job 级 `if`** 消费它的输出，最后由 `CI Gate` 收口。

| Job                            | 何时运行              | 内容                                                                          |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------- |
| `Changes`                      | 始终                  | diff 分析，产出 `code`（是否非纯文档改动）                                    |
| `Policy`                       | 始终（检查内容仅 PR） | commit message 规范、版本日志同步                                             |
| `Quality & Tests (node 22/24)` | `code=true`           | `fmt:check`、`lint`、`typecheck`、`test`，矩阵覆盖 `engines` 声明的 Node 区间 |
| `API Contract`                 | `code=true`           | `api:check`：重新生成契约派生文件并确认无差异                                 |
| `Build`                        | `code=true`           | `build`，产物上传为 `dist` artifact                                           |
| `E2E (Playwright)`             | `code=true`           | chromium 端到端，失败时上传 report 与 trace                                   |
| `CI Gate`                      | 始终                  | 聚合判定，见下                                                                |

约定：

- **纯文档 PR 只跑 `Changes` / `Policy` / `CI Gate`**，其余 job 报 `skipped`；这不是失败，`CI Gate` 会按「该域不适用」判定通过
- **不要改用 `on.pull_request.paths`**：被路径过滤掉的 required check 会永久 pending。必须用 job 级 `if`，让跳过显式可见
- 分支保护只 required `CI Gate` 一个名字；其余 job 改名不会破坏分支保护
- 同一分支的新推送会取消上一次未完成的运行（`concurrency.cancel-in-progress`）

`CI Gate` 的判定表是 fail-closed 的（适用却非 success、不适用却没跳过、router 未成功都算失败），实现见 [`scripts/check_ci_gate.sh`](../scripts/check_ci_gate.sh)。可本地用模拟值跑一遍：

```bash
bash scripts/check_ci_gate.sh "CI Gate" success "Policy=success=true" "Build=skipped=false"   # 通过
bash scripts/check_ci_gate.sh "CI Gate" success "Policy=success=true" "Build=skipped=true"    # 失败：该跑却跳过
```

## Tag 与发布

- 发布在 `master` tip 打 `vMAJOR.MINOR.PATCH` tag（SemVer，无预发布标签）
- `.github/workflows/release.yml` 由 tag 触发，分三段：`Verify Tag`（tag 必须指向当前 `master` tip）→ `Build`（要求 `docs/releases/<tag>.md` 存在、`pnpm run build`、打包 `jimu-portal-<tag>.tar.gz`）→ `Publish Release`（以版本文件为 Release body 创建 GitHub Release）
- 发布产物是静态资源包，解压后的内容即站点根目录，由 Nginx/CDN 等静态托管
- 回滚：`master` 不允许强推，用 revert commit 走正常 PR；已发布的 tag 不重打，改版本号重新发布

## Release Note

发布说明按版本号存放于 `docs/releases/<version>.md`（如 [`docs/releases/v0.1.0.md`](releases/v0.1.0.md)），同一文件既是版本 changelog 也是 GitHub Release body。

**改动产品代码（`src/`、`index.html`、`package.json`）的 PR 必须同步更新当前版本文件**，否则 `Policy` job 失败。当前版本号取自 `package.json` 的 `version`。

每个版本文件按以下顺序组织：

```markdown
# v0.1.0

## 亮点

- 一句话说明本版本最重要的变化。

## 新增

- 新增能力。

## 变更

- 行为、流程、配置或文档变化。

## 修复

- 修复项。

## 移除

- 删除项。

## 验证

- 发布前跑过的关键命令和结果。

## 说明

- 已知限制、部署提醒和后续事项。
```

规则：

- 版本号使用 SemVer：`vMAJOR.MINOR.PATCH`
- 条目使用中文，面向使用者说明结果，不写内部流水账
- 没有内容的分类可以省略，但 `亮点`、`验证`、`说明` 必须保留
- `验证` 必须写真实跑过的命令与结果（如 `pnpm run check`、`pnpm run test:e2e`、CI run 链接），无法运行时明确说明原因

## 代码规范

- 界面按用户能力组织：具体业务域确定后再建 `src/features/<domain>/`，`src/shared/` 只放确实被多个能力复用的内容
- 不在前端复制后端领域规则（错误码分段、归属模型、套餐与配额上限）；需要时查 `jimu` 仓库文档
- 不传租户标识（header、query、请求体都不传），租户范围与权限判定以服务端返回为准
- `src/shared/api/generated.ts` 是 `pnpm run api:types` 的派生产物，只读，不手写业务逻辑
- 契约变更流程：替换 `contracts/jimu.swagger.yaml` → 更新 `contracts/backend-commit.txt` → 运行 `pnpm run api:types` → 提交派生文件
- 修改脚本、工具或目录约定后，同步更新 [README.md](../README.md)

提交前至少运行：

```bash
pnpm run check
```

## 测试

```bash
pnpm run test        # Vitest 单元测试
pnpm run test:watch  # 监听模式
pnpm run test:e2e    # Playwright（首次需 pnpm exec playwright install chromium）
```

- 代码改动先写聚焦测试，并先观察测试失败，再实现最小行为
- 单元测试与 E2E 各自覆盖当前实际行为；登录、会话刷新、租户范围与无权限访问的测试在对应功能实现时补充

## 依赖更新

dependabot 每周一 09:00（Asia/Shanghai）对 npm 与 GitHub Actions 各开一组 PR：同族依赖合并成一个 PR，其余 minor/patch 归入兜底组，major 单独开。配置见 [`.github/dependabot.yml`](../.github/dependabot.yml)。

- dependabot PR 跳过 commit message 与版本日志检查（其余门禁照跑）；豁免按 **PR 作者**判定，所以维护者在 PR 页面点 `Update branch` 同步依赖分支不会让这两个检查误触发
- 需要同步依赖 PR 时优先点 `Update branch`（或评论 `@dependabot rebase`）；分支保护是 `strict`，PR 必须与 `master` 同步后才能合并
- 不设自动合并，依赖升级由人工确认后合并；major 版本可能不被当前工具链支持（例如 TypeScript 7 尚未被 typescript-eslint / vue-tsc / openapi-typescript 支持），此时应保留 PR 或为该项加 dependabot `ignore` 规则，不要强行合并

## 报告问题

- Bug 报告：[Bug Report 模板](https://github.com/wangkuntian/jimu-web/issues/new?template=bug_report.md)
- 功能建议：[Feature Request 模板](https://github.com/wangkuntian/jimu-web/issues/new?template=feature_request.md)

## 行为准则

保持友善、尊重、建设性。
