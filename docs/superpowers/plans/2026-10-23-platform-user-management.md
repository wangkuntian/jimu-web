# Platform User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dual user/admin workspace routing and a complete platform user management page backed by the `cf11650` contract.

**Architecture:** Keep one authentication/session layer and split protected pages into `UserLayout` and `PortalLayout` route trees. Resolve `/hub` from backend permissions and remembered surface choice; implement user management as a focused `src/features/users` module using Vue Query, Element Plus, and existing error/state patterns.

**Tech Stack:** Vue 3.5, TypeScript, Vue Router, Vue Query, Element Plus, Vitest, Playwright, pinned OpenAPI types.

**Spec:** `docs/superpowers/specs/2026-10-23-platform-user-management-design.md`

## Global Constraints

- Backend contract pin: `cf116508ba73763edcf97599a9436628ce3969b1`.
- Never infer authorization from role names; use backend `permissions`.
- Never send tenant context in headers, query, or body unless selecting a target tenant in the platform create request.
- IDs from the user, tenant, and role APIs are strings.
- Do not commit unless the user explicitly requests it.
- Run `pnpm run check` and `pnpm run test:e2e` before reporting completion.

## Review Focus

- A user without admin capability must not remain on `/admin` after navigation.
- A multi-surface user must not lose the deep link they used before login.
- Tenant changes in the create drawer must clear stale role selections.
- Disable must be presented as deactivation, not deletion, and must remain recoverable through edit.
- String IDs must not be converted back to numbers anywhere in routes, table keys, or request payloads.

---

### Task 1: Sync Contract and Migrate ID Types

**Files:**

- Modify: `contracts/backend-commit.txt`
- Modify: `contracts/jimu.swagger.yaml`
- Modify: `contracts/jimu.openapi.yaml`
- Modify: `src/shared/api/generated.ts`
- Modify: `src/shared/api/types.ts`
- Modify: `src/features/tenants/api.ts`
- Modify: `src/features/tenants/params.ts`
- Modify: `src/features/tenants/views/TenantsView.vue`
- Test: `tests/unit/tenants-api.spec.ts`
- Test: `tests/unit/tenants-view.spec.ts`

**Interfaces:**

- Produces: generated `application.UserResponse`, `application.UserPageResponse`, `application.RoleResponse`, `application.AssignUserRolesRequest`.
- Produces: `Tenant.id: string`, `Role.id: string`, `User.id: string`.

- [ ] Run `bash scripts/sync-contract.sh cf116508ba73763edcf97599a9436628ce3969b1`.
- [ ] Run `pnpm run api:types` and inspect generated User/Role schema names.
- [ ] Update tenant API signatures and UI code from numeric IDs to string IDs; remove `isPreciseId` guards caused by the old numeric serialization.
- [ ] Run focused tenant tests and `pnpm run typecheck`.

### Task 2: Add Workspace Surface Resolution

**Files:**

- Create: `src/shared/auth/surfaces.ts`
- Test: `tests/unit/surfaces.spec.ts`

**Interfaces:**

- Produces: `type AppSurface = 'workspace' | 'admin'`
- Produces: `canAccessWorkspace(): true`
- Produces: `canAccessAdminSurface(): boolean`
- Produces: `readLastSurface(): AppSurface | null`
- Produces: `rememberSurface(surface: AppSurface): void`

- [ ] Write failing tests for admin access from `/api/v1/users` or `/api/v1/tenants` and last-surface persistence.
- [ ] Implement surface helpers using `hasPermission(apiResource(...), 'GET')`.
- [ ] Run `pnpm exec vitest run tests/unit/surfaces.spec.ts`.

### Task 3: Split Protected Routes and Add Hub

**Files:**

- Create: `src/features/hub/views/HubView.vue`
- Create: `src/layouts/UserLayout.vue`
- Modify: `src/layouts/PortalLayout.vue`
- Modify: `src/app/router/index.ts`
- Modify: `src/features/auth/views/LoginView.vue`
- Modify: `src/app/guards/session.ts`
- Test: `tests/unit/hub-view.spec.ts`
- Test: `tests/unit/session-guard.spec.ts`
- Test: `tests/unit/login-view.spec.ts`

**Interfaces:**

- Consumes: `canAccessAdminSurface`, `readLastSurface`, `rememberSurface`.
- Produces routes: `/hub`, `/workspace`, `/workspace/account/security`, `/admin`, `/admin/users`, `/admin/tenants`, `/admin/account/security`.
- Produces redirects: `/portal` → `/hub`, `/platform/tenants` → `/admin/tenants`, `/account/security` → `/workspace/account/security`.

- [ ] Write failing tests for surface redirects, legacy redirects, and login default target `/hub`.
- [ ] Implement route trees, `HubView`, `UserLayout`, admin navigation changes, and login default.
- [ ] Run focused unit tests and verify direct deep links still win over `/hub`.

### Task 4: Add User Query and API Layer

**Files:**

- Create: `src/features/users/params.ts`
- Create: `src/features/users/api.ts`
- Modify: `src/shared/api/types.ts`
- Test: `tests/unit/user-params.spec.ts`
- Test: `tests/unit/users-api.spec.ts`

**Interfaces:**

- Produces: `UserFilters`, `buildUserListQuery(filters)`.
- Produces: `listUsers`, `getUser`, `createUser`, `updateUser`, `disableUser`, `assignUserRoles`, `listRoles`, `listTenantOptions`.

- [ ] Write failing tests for query omission, string IDs, create payload, role replacement, and 204 disable response.
- [ ] Implement API functions with the existing envelope helpers and Vue Query-compatible return shapes.
- [ ] Run the two focused test files.

### Task 5: Build User List and Filters

**Files:**

- Create: `src/features/users/views/UsersView.vue`
- Test: `tests/unit/users-view.spec.ts`

**Interfaces:**

- Consumes: Task 4 API functions and `UserFilters`.
- Produces: permission-aware list, filters, pagination, loading/error/empty/forbidden states.

- [ ] Write failing tests for list rendering, tenant/status filters, permission-hidden actions, and stale-page correction.
- [ ] Implement the list and filter bar with Element Plus and Vue Query.
- [ ] Run `pnpm exec vitest run tests/unit/users-view.spec.ts`.

### Task 6: Add Create, Edit, Role Assignment, and Disable

**Files:**

- Modify: `src/features/users/views/UsersView.vue`
- Test: `tests/unit/users-view.spec.ts`

**Interfaces:**

- Consumes: all Task 4 mutations.
- Produces: create drawer with required tenant and tenant-scoped roles, edit drawer, role dialog, disable confirmation.

- [ ] Write failing tests for tenant-required create, role reset on tenant change, edit payload, role replacement, and disable confirmation.
- [ ] Implement the interaction states with Element Plus.
- [ ] Run focused unit tests.

### Task 7: E2E, Documentation, and Release Notes

**Files:**

- Create: `e2e/workspaces.spec.ts`
- Modify: `e2e/helpers/session.ts`
- Modify: `e2e/*.spec.ts`
- Modify: `README.md`
- Modify: `docs/releases/v0.3.0.md`

**Interfaces:**

- Consumes: all routes and page APIs from Tasks 1–6.

- [ ] Add Playwright coverage for `/hub`, surface redirects, legacy redirects, `/admin/users` list, create, edit, role assignment, and disable.
- [ ] Update existing tests for `/admin/*` and string ID fixtures.
- [ ] Update README routes and verification coverage.
- [ ] Update release notes.
- [ ] Run `pnpm run check` and `pnpm run test:e2e`.

## Self-Review

- Spec coverage: all confirmed routes, user-management operations, permissions, ID migration, and non-goals map to Tasks 1–7.
- Type consistency: string IDs are used consistently; role replacement uses `role_ids`; disable is a 204.
- Review focus: each risk has a failing test in the owning task.
