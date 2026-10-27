# Platform User Management and Dual Workspace Design

日期：2026-10-23

## 背景

后端 `jimu` 已推送 `cf116508ba73763edcf97599a9436628ce3969b1`，把平台用户管理统一到 `/api/v1/users*`，并提供租户、角色和字符串 ID 数据。

前端首版需要同时建立用户工作区与管理控制台的分流骨架，并在管理控制台提供平台用户管理。

## 目标

- `/login` 仍是唯一登录入口。
- `/hub` 是多工作台选择页；`/portal` 重定向到 `/hub`。
- `/workspace/*` 是用户工作区，使用独立 `UserLayout`。
- `/admin/*` 是管理控制台，继续使用 `PortalLayout`。
- `/admin/users` 提供平台用户列表、筛选、创建、编辑、角色分配、停用和删除。
- 平台管理员创建用户时必须选择所属租户；角色只从目标租户加载。
- 共享登录、会话、权限判定、API client 和基础组件，不建立第二套认证。

## 非目标

- 不做批量停用、CSV 导出、用户导入、邀请注册、密码重置或跨租户迁移。
- 不根据角色名推导权限；是否可见和可操作只由服务端 `permissions` 决定。
- 不在前端保存租户身份作为请求上下文。

## 工作台分流

- 用户工作区对所有已登录用户可用。
- 管理控制台在具备用户、角色或租户管理读取能力时显示。
- 只有一个可用工作台时直接进入。
- 存在两个工作台时，首次进入 `/hub`；之后恢复最近使用的可用工作台，并允许通过账户菜单切换。
- 明确访问 `/admin/*` 或 `/workspace/*` 的登录回跳优先于默认 `/hub`。

## 用户管理接口

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
DELETE /api/v1/users/{id}
POST   /api/v1/users/{id}/roles
GET    /api/v1/roles/options?tenant_id={tenantId}
```

- 列表筛选：`username`、`status`、`tenant_id`、`page`、`page_size`、`sort`、`order`。
- 创建请求：`tenant_id`、`username`、`password`、`email`、`phone`、`role_ids`。
- 更新请求：`status`、`email`、`phone`。
- 停用使用 `PUT /users/{id}` + `status=0`；删除使用 `DELETE /users/{id}` 软删除，最后一个有效平台超管删除返回 `409`。
- 角色分配使用 `role_ids` 替换用户全部角色；可分配角色只读取目标租户的启用角色选项。
- 用户、租户和角色 ID 在前端统一按字符串处理。

## 页面设计

- `/admin/users` 使用筛选栏、分页表格、创建抽屉、编辑抽屉、角色分配对话框，以及独立的停用/删除确认。
- 表格列：用户名、所属租户、角色、状态、创建时间、操作。
- 创建抽屉先选择租户，再加载该租户角色；切换租户时清空已选角色。
- 状态使用启用/停用标签；停用保留数据，可通过编辑重新启用；删除后账号从常规列表消失。
- 加载、空、错误、无权限和身份不可用状态沿用租户管理页的互斥判定方式。

## 权限

- 页面读取：`GET /api/v1/users`
- 创建：`POST /api/v1/users`
- 编辑：`PUT /api/v1/users/*`
- 停用：`PUT /api/v1/users/*`
- 删除：`DELETE /api/v1/users/*`
- 角色分配：`POST /api/v1/users/*/roles`
- 角色选项：`GET /api/v1/roles/options`
- 租户选项：`GET /api/v1/tenants`

## 兼容与迁移

- `/portal` → `/hub`
- `/platform/tenants` → `/admin/tenants`
- `/account/security` → `/workspace/account/security`
- 保留现有 `/workspace` 用户工作区路径。
- 同步契约后，租户 ID 从 number 迁移为 string，删除前端 `isPreciseId` 守卫。

## 验证

- 单元测试覆盖工作台分流、用户查询参数、请求载荷、权限和 ID 迁移。
- Playwright 覆盖 `/hub`、旧路由重定向、管理员/普通用户分流、用户列表、筛选、创建、编辑、角色分配、停用和删除。
- `pnpm run check` 与 `pnpm run test:e2e` 必须通过。
