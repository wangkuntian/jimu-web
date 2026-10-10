## 变更说明

<!-- 简要描述本 PR 做了什么，以及为什么 -->

## 变更类型

- [ ] feat: 新功能
- [ ] fix: 缺陷修复
- [ ] docs: 文档修改
- [ ] test: 测试新增或调整
- [ ] refactor: 不改变行为的重构
- [ ] perf: 性能优化
- [ ] ci: CI 或构建流程修改
- [ ] chore: 依赖、维护类修改

## 检查清单

- [ ] commit message 符合 `type(scope): summary`（`pnpm run hooks:install` 后有本地钩子拦截）
- [ ] `pnpm run check` 通过（契约同步、格式、lint、类型、单测、构建）
- [ ] 行为变更补充了对应测试（Vitest 单测或 Playwright E2E）
- [ ] 改动源码时同步更新了 `docs/releases/v<version>.md`
- [ ] 契约变更时更新了 `contracts/backend-commit.txt` 并运行 `pnpm run api:types`
- [ ] 文档已更新（README / AGENTS.md / CONTRIBUTING.md，如需要）

## 相关 Issue

<!-- 关联的 issue 编号，如 #123 -->

## 风险与注意事项

<!-- 破坏性变更、后端契约依赖、部署或浏览器兼容性影响等 -->
