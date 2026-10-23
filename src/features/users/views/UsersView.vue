<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Search } from '@lucide/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  assignUserRoles,
  createUser,
  disableUser,
  listRoles,
  listTenantOptions,
  listUsers,
  updateUser,
} from '../api'
import { buildUserListQuery } from '../params'
import type { UserFilters } from '../params'
import { apiResource } from '../../../shared/api/config'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import type { Role, Tenant, User } from '../../../shared/api/types'
import { ensureIdentity, getIdentityStatus } from '../../../shared/auth/identity'
import { hasPermission } from '../../../shared/auth/permission'
import { clampPage } from '../../tenants/params'

const canView = computed(() => hasPermission(apiResource('/users'), 'GET'))
const canCreate = computed(() => hasPermission(apiResource('/users'), 'POST'))
const canListTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
const canListRoles = computed(() => hasPermission(apiResource('/roles'), 'GET'))
const identityStatus = computed(() => getIdentityStatus())
const queryClient = useQueryClient()

const filters = reactive<UserFilters>({
  page: 1,
  pageSize: 20,
  sort: 'id',
  order: 'desc',
  username: '',
  status: '',
  tenantId: '',
})
const keywordDraft = ref('')
const listQuery = computed(() => buildUserListQuery(filters))

const usersQuery = useQuery({
  queryKey: ['users', listQuery],
  queryFn: () => listUsers(listQuery.value),
  enabled: canView,
})

const tenantOptionsQuery = useQuery({
  queryKey: ['tenant-options'],
  queryFn: listTenantOptions,
  enabled: canListTenants,
})

const roleTenantId = ref('')
const rolesQuery = useQuery({
  queryKey: ['user-role-options', roleTenantId],
  queryFn: () => listRoles(roleTenantId.value),
  enabled: computed(() => canListRoles.value && roleTenantId.value !== ''),
})

const items = computed<User[]>(() => usersQuery.data.value?.items ?? [])
const total = computed(() => usersQuery.data.value?.total ?? 0)
const tenants = computed<Tenant[]>(() => tenantOptionsQuery.data.value ?? [])
const roles = computed<Role[]>(() => rolesQuery.data.value ?? [])

const listError = computed(() => {
  const error = usersQuery.error.value
  return error instanceof ApiError ? error : null
})
const listErrorMessage = computed(() => listError.value?.message ?? '加载用户列表失败')
const listErrorRequestId = computed(() => listError.value?.requestId ?? '')

const viewState = computed<
  'forbidden' | 'identity-error' | 'loading' | 'error' | 'empty' | 'table'
>(() => {
  if (listError.value?.code === ErrorCode.forbidden) {
    return 'forbidden'
  }
  if (!canView.value) {
    if (identityStatus.value === 'unavailable') {
      return 'identity-error'
    }
    if (identityStatus.value === 'ok') {
      return 'forbidden'
    }
    return 'loading'
  }
  if (usersQuery.isPending.value) {
    return 'loading'
  }
  if (usersQuery.isError.value) {
    return 'error'
  }
  if (items.value.length === 0) {
    return 'empty'
  }
  return 'table'
})

function resetPage(): void {
  filters.page = 1
}

function applyKeyword(): void {
  filters.username = keywordDraft.value
  filters.page = 1
}

watch([items, total], ([rows, count]) => {
  if (rows.length > 0 || count <= 0) {
    return
  }
  const clamped = clampPage(filters.page, filters.pageSize, count)
  if (clamped !== filters.page) {
    filters.page = clamped
  }
})

async function retryIdentity(): Promise<void> {
  await ensureIdentity()
}

function canUpdate(row: User): boolean {
  return hasPermission(apiResource(`/users/${row.id}`), 'PUT')
}

function canDisable(row: User): boolean {
  return hasPermission(apiResource(`/users/${row.id}`), 'DELETE')
}

function canAssignRoles(row: User): boolean {
  return hasPermission(apiResource(`/users/${row.id}/roles`), 'POST')
}

function roleNames(row: User): string {
  return row.roles.length > 0 ? row.roles.map((role) => role.name).join('、') : '未分配'
}

function describeError(error: unknown): { message: string; requestId: string } {
  if (error instanceof ApiError) {
    return { message: error.message, requestId: error.requestId ?? '' }
  }
  return { message: '网络异常，请重试', requestId: '' }
}

function withRequestId(message: string, requestId: string): string {
  return requestId === '' ? message : `${message}（请求编号：${requestId}）`
}

function invalidateUsers(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['users'] })
}

const createVisible = ref(false)
const createError = ref('')
const createRequestId = ref('')
const createForm = reactive({
  tenantId: '',
  username: '',
  password: '',
  email: '',
  phone: '',
  roleIds: [] as string[],
})
const canSubmitCreate = computed(
  () =>
    createForm.tenantId !== '' &&
    createForm.username.trim().length >= 3 &&
    createForm.password.length >= 6,
)

const { isPending: creating, mutateAsync: createUserAsync } = useMutation({
  mutationFn: () =>
    createUser({
      tenant_id: createForm.tenantId,
      username: createForm.username.trim(),
      password: createForm.password,
      email: createForm.email.trim(),
      phone: createForm.phone.trim(),
      role_ids: createForm.roleIds,
    }),
  onSuccess: invalidateUsers,
})

function openCreate(): void {
  createForm.tenantId = ''
  createForm.username = ''
  createForm.password = ''
  createForm.email = ''
  createForm.phone = ''
  createForm.roleIds = []
  createError.value = ''
  createRequestId.value = ''
  roleTenantId.value = ''
  createVisible.value = true
}

function onTargetTenantChange(): void {
  createForm.roleIds = []
  roleTenantId.value = createForm.tenantId
}

async function submitCreate(): Promise<void> {
  if (!canSubmitCreate.value) {
    return
  }
  createError.value = ''
  createRequestId.value = ''

  try {
    await createUserAsync()
    createVisible.value = false
    ElMessage.success('用户已创建')
  } catch (error) {
    const info = describeError(error)
    createError.value = info.message
    createRequestId.value = info.requestId
  }
}

const editVisible = ref(false)
const editTarget = ref<User | null>(null)
const editError = ref('')
const editRequestId = ref('')
const editForm = reactive<{ status: 0 | 1; email: string; phone: string }>({
  status: 1,
  email: '',
  phone: '',
})

const { isPending: updating, mutateAsync: updateUserAsync } = useMutation({
  mutationFn: () => {
    if (editTarget.value === null) {
      throw new Error('missing user target')
    }
    return updateUser(editTarget.value.id, {
      status: editForm.status,
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
    })
  },
  onSuccess: invalidateUsers,
})

function openEdit(row: User): void {
  editTarget.value = row
  editForm.status = row.status === 1 ? 1 : 0
  editForm.email = row.email
  editForm.phone = row.phone
  editError.value = ''
  editRequestId.value = ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  editError.value = ''
  editRequestId.value = ''

  try {
    await updateUserAsync()
    editVisible.value = false
    ElMessage.success('用户已更新')
  } catch (error) {
    const info = describeError(error)
    editError.value = info.message
    editRequestId.value = info.requestId
  }
}

const roleVisible = ref(false)
const roleTarget = ref<User | null>(null)
const roleSelection = ref<string[]>([])
const roleError = ref('')
const roleRequestId = ref('')

const { isPending: assigningRoles, mutateAsync: assignRolesAsync } = useMutation({
  mutationFn: () => {
    if (roleTarget.value === null) {
      throw new Error('missing user target')
    }
    return assignUserRoles(roleTarget.value.id, roleSelection.value)
  },
  onSuccess: invalidateUsers,
})

function openRoles(row: User): void {
  roleTarget.value = row
  roleSelection.value = row.roles.map((role) => role.id)
  roleTenantId.value = row.tenant.id
  roleError.value = ''
  roleRequestId.value = ''
  roleVisible.value = true
}

async function submitRoles(): Promise<void> {
  roleError.value = ''
  roleRequestId.value = ''

  try {
    await assignRolesAsync()
    roleVisible.value = false
    ElMessage.success('用户角色已更新')
  } catch (error) {
    const info = describeError(error)
    roleError.value = info.message
    roleRequestId.value = info.requestId
  }
}

const { mutateAsync: disableUserAsync } = useMutation({
  mutationFn: (id: string) => disableUser(id),
  onSuccess: invalidateUsers,
})

async function onDisable(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '停用后该用户将无法登录，账号数据仍会保留，可通过编辑重新启用。确认停用？',
      '停用用户',
      {
        type: 'warning',
        confirmButtonText: '停用',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  try {
    await disableUserAsync(row.id)
    ElMessage.success('用户已停用')
  } catch (error) {
    const info = describeError(error)
    ElMessage.error(withRequestId(info.message, info.requestId))
  }
}
</script>

<template>
  <section class="users-page" aria-labelledby="users-title">
    <header class="users-heading">
      <div>
        <p class="eyebrow">Platform</p>
        <h1 id="users-title">用户管理</h1>
        <p class="page-lead">管理平台用户、所属租户与访问角色。</p>
      </div>
    </header>

    <div v-if="viewState === 'forbidden'" class="users-state">
      <el-result
        data-test="users-forbidden"
        icon="warning"
        title="没有访问用户管理的权限"
        sub-title="请让管理员为你的账号分配 /api/v1/users 的 GET 权限"
      />
    </div>

    <div
      v-else-if="viewState === 'identity-error'"
      class="users-state"
      data-test="users-identity-error"
    >
      <el-alert
        type="error"
        :closable="false"
        show-icon
        title="无法确认你的身份"
        description="后端暂时不可用，读不到当前账号的身份与权限。这不代表权限被移除，请稍后重试。"
      />
      <el-button class="users-retry" data-test="users-identity-retry" @click="retryIdentity">
        重试
      </el-button>
    </div>

    <template v-else>
      <el-form class="users-filters" inline @submit.prevent="applyKeyword">
        <el-form-item label="用户名">
          <el-input
            v-model="keywordDraft"
            class="users-username-input"
            clearable
            placeholder="搜索用户名"
            data-test="user-username-filter"
            @keyup.enter="applyKeyword"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item v-if="canListTenants" label="租户">
          <el-select
            v-model="filters.tenantId"
            class="users-select"
            clearable
            placeholder="全部租户"
            data-test="user-tenant-filter"
            @change="resetPage"
          >
            <el-option
              v-for="tenantOption in tenants"
              :key="tenantOption.id"
              :label="tenantOption.name"
              :value="tenantOption.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="状态">
          <el-select
            v-model="filters.status"
            class="users-select users-status-select"
            placeholder="全部状态"
            data-test="user-status-filter"
            @change="resetPage"
          >
            <el-option label="全部状态" value="" />
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button data-test="user-search" @click="applyKeyword">搜索</el-button>
          <el-button
            v-if="canCreate && viewState === 'table'"
            type="primary"
            data-test="user-create"
            @click="openCreate"
          >
            新建用户
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="viewState === 'loading'" class="users-state">
        <el-skeleton data-test="users-loading" :rows="5" animated />
      </div>

      <div v-else-if="viewState === 'error'" class="users-state" data-test="users-error">
        <el-alert type="error" :closable="false" show-icon :title="listErrorMessage" />
        <p v-if="listErrorRequestId" class="request-id">请求编号：{{ listErrorRequestId }}</p>
        <el-button class="users-retry" @click="usersQuery.refetch()">重试</el-button>
      </div>

      <div v-else-if="viewState === 'empty'" class="users-state">
        <el-empty data-test="users-empty" description="没有找到符合条件的用户">
          <el-button v-if="canCreate" type="primary" data-test="user-create" @click="openCreate">
            新建用户
          </el-button>
        </el-empty>
      </div>

      <template v-else>
        <div class="users-table-scroll" data-test="users-table">
          <el-table class="users-table" :data="items" row-key="id">
            <el-table-column label="用户" min-width="220">
              <template #default="scope">
                <div class="user-identity">
                  <strong>{{ scope.row.username }}</strong>
                  <span v-if="scope.row.email">{{ scope.row.email }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="所属租户" min-width="160">
              <template #default="scope">{{ scope.row.tenant.name }}</template>
            </el-table-column>

            <el-table-column label="角色" min-width="180">
              <template #default="scope">{{ roleNames(scope.row) }}</template>
            </el-table-column>

            <el-table-column label="状态" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.status === 1 ? 'success' : 'info'">
                  {{ scope.row.status === 1 ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column prop="created_at" label="创建时间" min-width="190" />

            <el-table-column label="操作" min-width="220">
              <template #default="scope">
                <el-button
                  v-if="canUpdate(scope.row)"
                  text
                  type="primary"
                  @click="openEdit(scope.row)"
                >
                  编辑
                </el-button>
                <el-button
                  v-if="canAssignRoles(scope.row) && canListRoles"
                  text
                  type="primary"
                  @click="openRoles(scope.row)"
                >
                  角色
                </el-button>
                <el-button
                  v-if="canDisable(scope.row) && scope.row.status === 1"
                  text
                  type="danger"
                  @click="onDisable(scope.row)"
                >
                  停用
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-pagination
          v-if="total > 0"
          v-model:current-page="filters.page"
          data-test="users-pagination"
          class="users-pagination"
          :page-size="filters.pageSize"
          :total="total"
          layout="prev, pager, next, total"
          background
        />
      </template>
    </template>

    <el-drawer v-model="createVisible" title="新建用户" size="480px" data-test="user-create-drawer">
      <el-alert v-if="createError" type="error" :closable="false" show-icon :title="createError" />
      <p v-if="createRequestId" class="request-id">请求编号：{{ createRequestId }}</p>

      <el-form class="user-form" label-position="top" @submit.prevent="submitCreate">
        <el-form-item label="所属租户" required>
          <el-select
            v-model="createForm.tenantId"
            placeholder="请选择所属租户"
            data-test="user-create-tenant"
            :loading="tenantOptionsQuery.isPending.value"
            @change="onTargetTenantChange"
          >
            <el-option
              v-for="tenantOption in tenants"
              :key="tenantOption.id"
              :label="tenantOption.name"
              :value="tenantOption.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="用户名" required>
          <el-input
            v-model="createForm.username"
            maxlength="64"
            autocomplete="off"
            data-test="user-create-username"
          />
        </el-form-item>

        <el-form-item label="初始密码" required>
          <el-input
            v-model="createForm.password"
            type="password"
            show-password
            maxlength="32"
            autocomplete="new-password"
            data-test="user-create-password"
          />
        </el-form-item>

        <el-form-item label="邮箱">
          <el-input
            v-model="createForm.email"
            type="email"
            autocomplete="off"
            data-test="user-create-email"
          />
        </el-form-item>

        <el-form-item label="手机号">
          <el-input v-model="createForm.phone" autocomplete="off" data-test="user-create-phone" />
        </el-form-item>

        <el-form-item v-if="canListRoles" label="角色">
          <el-select
            v-model="createForm.roleIds"
            multiple
            collapse-tags
            placeholder="选择角色"
            data-test="user-create-roles"
            :loading="rolesQuery.isPending.value"
            :disabled="createForm.tenantId === ''"
          >
            <el-option
              v-for="roleOption in roles"
              :key="roleOption.id"
              :label="roleOption.name"
              :value="roleOption.id"
            />
          </el-select>
        </el-form-item>

        <div class="user-form-actions">
          <el-button @click="createVisible = false">取消</el-button>
          <el-button
            type="primary"
            data-test="user-create-submit"
            :disabled="!canSubmitCreate"
            :loading="creating"
            @click="submitCreate"
          >
            创建用户
          </el-button>
        </div>
      </el-form>
    </el-drawer>

    <el-drawer v-model="editVisible" title="编辑用户" size="480px" data-test="user-edit-drawer">
      <el-alert v-if="editError" type="error" :closable="false" show-icon :title="editError" />
      <p v-if="editRequestId" class="request-id">请求编号：{{ editRequestId }}</p>

      <el-descriptions v-if="editTarget" :column="1" border class="user-edit-summary">
        <el-descriptions-item label="用户名">{{ editTarget.username }}</el-descriptions-item>
        <el-descriptions-item label="所属租户">
          {{ editTarget.tenant.name }}
        </el-descriptions-item>
      </el-descriptions>

      <el-form class="user-form" label-position="top" @submit.prevent="submitEdit">
        <el-form-item label="状态">
          <el-select v-model="editForm.status" data-test="user-edit-status">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>

        <el-form-item label="邮箱">
          <el-input
            v-model="editForm.email"
            type="email"
            autocomplete="off"
            data-test="user-edit-email"
          />
        </el-form-item>

        <el-form-item label="手机号">
          <el-input v-model="editForm.phone" autocomplete="off" data-test="user-edit-phone" />
        </el-form-item>

        <div class="user-form-actions">
          <el-button @click="editVisible = false">取消</el-button>
          <el-button
            type="primary"
            data-test="user-edit-submit"
            :loading="updating"
            @click="submitEdit"
          >
            保存更改
          </el-button>
        </div>
      </el-form>
    </el-drawer>

    <el-dialog v-model="roleVisible" title="分配角色" width="480px" data-test="user-role-dialog">
      <el-alert v-if="roleError" type="error" :closable="false" show-icon :title="roleError" />
      <p v-if="roleRequestId" class="request-id">请求编号：{{ roleRequestId }}</p>
      <p class="role-dialog-description">
        保存后会替换
        <strong>{{ roleTarget?.username }}</strong>
        的全部角色。
      </p>

      <el-select
        v-model="roleSelection"
        multiple
        collapse-tags
        placeholder="选择角色"
        data-test="user-role-select"
        :loading="rolesQuery.isPending.value"
      >
        <el-option
          v-for="roleOption in roles"
          :key="roleOption.id"
          :label="roleOption.name"
          :value="roleOption.id"
        />
      </el-select>

      <template #footer>
        <el-button @click="roleVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-test="user-role-submit"
          :loading="assigningRoles"
          @click="submitRoles"
        >
          保存角色
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.users-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.users-heading h1 {
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.33;
}

.users-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 16px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.users-filters :deep(.el-form-item) {
  margin: 0;
}

.users-username-input {
  width: 220px;
}

.users-select {
  width: 150px;
}

.users-status-select {
  width: 120px;
}

.users-state {
  margin-top: 24px;
}

.users-retry {
  margin-top: 12px;
}

.users-table-scroll {
  margin-top: 16px;
  overflow-x: auto;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.users-table {
  min-width: 1050px;
}

.user-identity {
  display: grid;
  gap: 2px;
}

.user-identity strong {
  font-weight: var(--jp-font-weight-emphasis);
}

.user-identity span {
  overflow: hidden;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.users-pagination {
  margin-top: 16px;
}

.user-form {
  margin-top: 24px;
}

.user-form :deep(.el-select) {
  width: 100%;
}

.user-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.user-edit-summary {
  margin-top: 20px;
}

.role-dialog-description {
  margin: 20px 0 12px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
}

.role-dialog-description strong {
  color: var(--jp-color-text);
  font-weight: var(--jp-font-weight-emphasis);
}

.request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

@media (max-width: 640px) {
  .users-heading {
    align-items: flex-start;
  }

  .users-filters {
    align-items: stretch;
  }

  .users-filters :deep(.el-form-item) {
    width: 100%;
  }

  .users-username-input,
  .users-select,
  .users-status-select {
    width: 100%;
  }
}
</style>
