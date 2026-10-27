<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Search } from '@lucide/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getRolePermissions,
  listPermissions,
  listRoles,
  listTenantOptions,
  updateRole,
} from '../api'
import { buildRoleListQuery } from '../params'
import type { RoleFilters } from '../params'
import { apiResource } from '../../../shared/api/config'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import type { Permission, Role, Tenant } from '../../../shared/api/types'
import { ensureIdentity, getIdentityStatus } from '../../../shared/auth/identity'
import { hasPermission } from '../../../shared/auth/permission'
import ManagementPage from '../../../shared/components/ManagementPage.vue'
import { clampPage } from '../../tenants/params'

interface PermissionGroup {
  resource: string
  items: Permission[]
}

const queryClient = useQueryClient()

const canView = computed(() => hasPermission(apiResource('/roles'), 'GET'))
const canCreate = computed(() => hasPermission(apiResource('/roles'), 'POST'))
const canListTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
const canListPermissions = computed(() => hasPermission(apiResource('/permissions'), 'GET'))
const canCreateRole = computed(() => canCreate.value && canListTenants.value)
const identityStatus = computed(() => getIdentityStatus())

const filters = reactive<RoleFilters>({
  page: 1,
  pageSize: 20,
  sort: 'id',
  order: 'desc',
  keyword: '',
  status: '',
  tenantId: '',
})
const keywordDraft = ref('')
const listQuery = computed(() => buildRoleListQuery(filters))

const rolesQuery = useQuery({
  queryKey: ['roles', listQuery],
  queryFn: () => listRoles(listQuery.value),
  enabled: canView,
})

const tenantOptionsQuery = useQuery({
  queryKey: ['tenants', 'options'],
  queryFn: listTenantOptions,
  enabled: canListTenants,
})

const items = computed<Role[]>(() => rolesQuery.data.value?.items ?? [])
const total = computed(() => rolesQuery.data.value?.total ?? 0)
const tenants = computed<Tenant[]>(() => tenantOptionsQuery.data.value ?? [])
const tenantNames = computed(() => new Map(tenants.value.map((tenant) => [tenant.id, tenant.name])))

const listError = computed(() => {
  const error = rolesQuery.error.value
  return error instanceof ApiError ? error : null
})
const listErrorMessage = computed(() => listError.value?.message ?? '加载角色列表失败')
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
  if (rolesQuery.isPending.value) {
    return 'loading'
  }
  if (rolesQuery.isError.value) {
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
  filters.keyword = keywordDraft.value
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

function tenantName(tenantId: string): string {
  return tenantNames.value.get(tenantId) ?? `#${tenantId}`
}

function canUpdate(row: Role): boolean {
  return !row.is_system && hasPermission(apiResource(`/roles/${row.id}`), 'PUT')
}

function canDelete(row: Role): boolean {
  return !row.is_system && hasPermission(apiResource(`/roles/${row.id}`), 'DELETE')
}

function canViewPermissions(row: Role): boolean {
  return (
    canListPermissions.value && hasPermission(apiResource(`/roles/${row.id}/permissions`), 'GET')
  )
}

function canSavePermissions(row: Role): boolean {
  return (
    !row.is_system &&
    canViewPermissions(row) &&
    hasPermission(apiResource(`/roles/${row.id}/permissions`), 'POST')
  )
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

function invalidateRoles(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['roles'] })
}

const createVisible = ref(false)
const createForm = reactive({
  tenantId: '',
  name: '',
  description: '',
})
const createError = ref('')
const createRequestId = ref('')
const canSubmitCreate = computed(() => createForm.tenantId !== '' && createForm.name.trim() !== '')

const { isPending: creating, mutateAsync: createRoleAsync } = useMutation({
  mutationFn: () =>
    createRole({
      tenant_id: createForm.tenantId,
      name: createForm.name.trim(),
      description: createForm.description.trim(),
    }),
  onSuccess: invalidateRoles,
})

function openCreate(): void {
  createForm.tenantId = ''
  createForm.name = ''
  createForm.description = ''
  createError.value = ''
  createRequestId.value = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  if (!canSubmitCreate.value) {
    return
  }
  createError.value = ''
  createRequestId.value = ''

  try {
    await createRoleAsync()
    createVisible.value = false
    ElMessage.success('角色已创建')
  } catch (error) {
    const info = describeError(error)
    createError.value = info.message
    createRequestId.value = info.requestId
  }
}

const editVisible = ref(false)
const editTarget = ref<Role | null>(null)
const editForm = reactive<{ name: string; description: string; status: 0 | 1 }>({
  name: '',
  description: '',
  status: 1,
})
const editError = ref('')
const editRequestId = ref('')
const canSubmitEdit = computed(() => editForm.name.trim() !== '')

const { isPending: updating, mutateAsync: updateRoleAsync } = useMutation({
  mutationFn: () => {
    if (editTarget.value === null) {
      throw new Error('missing role target')
    }
    return updateRole(editTarget.value.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      status: editForm.status,
    })
  },
  onSuccess: invalidateRoles,
})

function openEdit(row: Role): void {
  editTarget.value = row
  editForm.name = row.name
  editForm.description = row.description
  editForm.status = row.status === 1 ? 1 : 0
  editError.value = ''
  editRequestId.value = ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  if (!canSubmitEdit.value) {
    return
  }
  editError.value = ''
  editRequestId.value = ''

  try {
    await updateRoleAsync()
    editVisible.value = false
    ElMessage.success('角色已更新')
  } catch (error) {
    const info = describeError(error)
    editError.value = info.message
    editRequestId.value = info.requestId
  }
}

const { mutateAsync: stopRoleAsync } = useMutation({
  mutationFn: (row: Role) =>
    updateRole(row.id, {
      name: row.name,
      description: row.description,
      status: 0,
    }),
  onSuccess: invalidateRoles,
})

async function onStop(row: Role): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '停用后该角色不再授予权限，角色数据仍会保留，可通过编辑重新启用。确认停用？',
      '停用角色',
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
    await stopRoleAsync(row)
    ElMessage.success('角色已停用')
  } catch (error) {
    const info = describeError(error)
    ElMessage.error(withRequestId(info.message, info.requestId))
  }
}

const { mutateAsync: deleteRoleAsync } = useMutation({
  mutationFn: (id: string) => deleteRole(id),
  onSuccess: invalidateRoles,
})

async function onDelete(row: Role): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '删除后无法恢复；已分配给用户的角色不能删除。确认删除该角色？',
      '删除角色',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  try {
    await deleteRoleAsync(row.id)
    ElMessage.success('角色已删除')
  } catch (error) {
    const info = describeError(error)
    ElMessage.error(withRequestId(info.message, info.requestId))
  }
}

const permissionVisible = ref(false)
const permissionTarget = ref<Role | null>(null)
const permissionSelection = ref<string[]>([])
const permissionKeyword = ref('')
const permissionError = ref('')
const permissionRequestId = ref('')
const permissionReadonly = computed(
  () => permissionTarget.value === null || !canSavePermissions(permissionTarget.value),
)
const permissionDrawerTitle = computed(() => (permissionReadonly.value ? '查看权限' : '分配权限'))
const permissionCopy = computed(() => {
  if (permissionTarget.value?.is_system === true) {
    return '系统角色的权限由后端维护，不可在此修改。'
  }
  if (permissionReadonly.value) {
    return '当前账号只有权限查看能力，不能修改此角色的权限。'
  }
  return '保存后会整体替换该角色的权限；清空全部勾选即移除全部权限。'
})

const currentPermissionsQuery = useQuery({
  queryKey: computed(() => ['role-permissions', permissionTarget.value?.id ?? '']),
  queryFn: () => getRolePermissions(permissionTarget.value!.id),
  enabled: computed(() => permissionVisible.value && permissionTarget.value !== null),
})

const permissionsCatalogQuery = useQuery({
  queryKey: ['permission-catalog'],
  queryFn: listPermissions,
  enabled: computed(() => permissionVisible.value && canListPermissions.value),
})

watch(
  () => currentPermissionsQuery.data.value,
  (permissions) => {
    if (permissionVisible.value && permissions !== undefined) {
      permissionSelection.value = permissions.map((permission) => permission.id)
    }
  },
)

const permissionCatalog = computed<Permission[]>(() => permissionsCatalogQuery.data.value ?? [])
const permissionLoading = computed(
  () => currentPermissionsQuery.isPending.value || permissionsCatalogQuery.isPending.value,
)
const permissionListError = computed(() => {
  const error = currentPermissionsQuery.error.value ?? permissionsCatalogQuery.error.value
  return error instanceof ApiError ? error : null
})

const permissionGroups = computed<PermissionGroup[]>(() => {
  const keyword = permissionKeyword.value.trim().toLowerCase()
  const filtered = permissionCatalog.value.filter((permission) => {
    if (keyword === '') {
      return true
    }
    return [permission.name, permission.resource, permission.action].some((value) =>
      value.toLowerCase().includes(keyword),
    )
  })
  const groups = new Map<string, Permission[]>()

  for (const permission of filtered) {
    const group = groups.get(permission.resource) ?? []
    group.push(permission)
    groups.set(permission.resource, group)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, permissions]) => ({
      resource,
      items: permissions.sort((left, right) => {
        if (left.action !== right.action) {
          return left.action.localeCompare(right.action)
        }
        return left.name.localeCompare(right.name)
      }),
    }))
})

const selectedPermissionCount = computed(() => permissionSelection.value.length)

const { isPending: assigningPermissions, mutateAsync: assignPermissionsAsync } = useMutation({
  mutationFn: () => {
    if (permissionTarget.value === null) {
      throw new Error('missing role target')
    }
    return assignRolePermissions(permissionTarget.value.id, permissionSelection.value)
  },
  onSuccess: async () => {
    if (permissionTarget.value !== null) {
      await queryClient.invalidateQueries({
        queryKey: ['role-permissions', permissionTarget.value.id],
      })
    }
    await invalidateRoles()
  },
})

function openPermissions(row: Role): void {
  permissionTarget.value = row
  permissionKeyword.value = ''
  permissionError.value = ''
  permissionRequestId.value = ''
  permissionSelection.value =
    queryClient
      .getQueryData<Permission[]>(['role-permissions', row.id])
      ?.map((permission) => permission.id) ?? []
  permissionVisible.value = true
  void currentPermissionsQuery.refetch()
  void permissionsCatalogQuery.refetch()
}

function groupSelected(group: PermissionGroup): boolean {
  return group.items.every((permission) => permissionSelection.value.includes(permission.id))
}

function groupIndeterminate(group: PermissionGroup): boolean {
  const count = group.items.filter((permission) =>
    permissionSelection.value.includes(permission.id),
  ).length
  return count > 0 && count < group.items.length
}

function toggleGroup(group: PermissionGroup, checked: string | number | boolean): void {
  const next = new Set(permissionSelection.value)
  for (const permission of group.items) {
    if (Boolean(checked)) {
      next.add(permission.id)
    } else {
      next.delete(permission.id)
    }
  }
  permissionSelection.value = [...next]
}

function togglePermission(permissionId: string, checked: string | number | boolean): void {
  const next = new Set(permissionSelection.value)
  if (Boolean(checked)) {
    next.add(permissionId)
  } else {
    next.delete(permissionId)
  }
  permissionSelection.value = [...next]
}

async function submitPermissions(): Promise<void> {
  permissionError.value = ''
  permissionRequestId.value = ''

  try {
    await assignPermissionsAsync()
    permissionVisible.value = false
    ElMessage.success('角色权限已更新')
  } catch (error) {
    const info = describeError(error)
    permissionError.value = info.message
    permissionRequestId.value = info.requestId
  }
}
</script>

<template>
  <ManagementPage
    v-model:page="filters.page"
    title="角色管理"
    description="管理租户角色、启停状态与权限边界。"
    title-id="roles-title"
    test-id-prefix="roles"
    :state="viewState"
    forbidden-title="没有访问角色管理的权限"
    forbidden-description="请让平台管理员为你的账号分配 /api/v1/roles 的 GET 权限。"
    :error-message="listErrorMessage"
    :error-request-id="listErrorRequestId"
    empty-description="没有找到符合条件的角色"
    :total="total"
    :page-size="filters.pageSize"
    @retry-identity="retryIdentity"
    @retry-list="rolesQuery.refetch()"
    @filter-submit="applyKeyword"
  >
    <template #filters>
      <el-form-item v-if="canListTenants" label="租户">
        <el-select
          v-model="filters.tenantId"
          class="management-filter-select"
          clearable
          placeholder="全部租户"
          data-test="role-tenant-filter"
          :loading="tenantOptionsQuery.isPending.value"
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

      <el-form-item label="角色名称">
        <el-input
          v-model="keywordDraft"
          class="management-filter-input"
          clearable
          placeholder="搜索角色名称"
          data-test="role-keyword-filter"
          @keyup.enter="applyKeyword"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="状态">
        <el-select
          v-model="filters.status"
          class="management-filter-select management-filter-select--narrow"
          placeholder="全部状态"
          data-test="role-status-filter"
          @change="resetPage"
        >
          <el-option label="全部状态" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
      </el-form-item>

      <el-form-item class="management-filter-actions">
        <el-button data-test="role-search" @click="applyKeyword">搜索</el-button>
        <el-button
          v-if="canCreateRole && viewState === 'table'"
          type="primary"
          data-test="role-create"
          @click="openCreate"
        >
          新建角色
        </el-button>
      </el-form-item>
    </template>

    <template #table>
      <el-table class="roles-table" :data="items" row-key="id">
        <el-table-column label="角色" min-width="260">
          <template #default="scope">
            <div class="role-identity">
              <div class="role-identity-title">
                <strong>{{ scope.row.name }}</strong>
                <el-tag v-if="scope.row.is_system" size="small" effect="plain">系统</el-tag>
                <code v-if="scope.row.code" class="role-code">{{ scope.row.code }}</code>
              </div>
              <span>{{ scope.row.description || '未填写说明' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="所属租户" min-width="180">
          <template #default="scope">{{ tenantName(scope.row.tenant_id) }}</template>
        </el-table-column>

        <el-table-column label="范围" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.scope === 'platform' ? 'warning' : 'info'" effect="plain">
              {{ scope.row.scope === 'platform' ? '平台' : '租户' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'info'">
              {{ scope.row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" label="创建时间" min-width="190" />

        <el-table-column label="操作" min-width="280">
          <template #default="scope">
            <el-button
              v-if="canViewPermissions(scope.row)"
              text
              type="primary"
              @click="openPermissions(scope.row)"
            >
              {{ canSavePermissions(scope.row) ? '权限' : '查看权限' }}
            </el-button>
            <el-button v-if="canUpdate(scope.row)" text type="primary" @click="openEdit(scope.row)">
              编辑
            </el-button>
            <el-button
              v-if="canUpdate(scope.row) && scope.row.status === 1"
              text
              type="danger"
              @click="onStop(scope.row)"
            >
              停用
            </el-button>
            <el-button v-if="canDelete(scope.row)" text type="danger" @click="onDelete(scope.row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template #empty-action>
      <el-button v-if="canCreateRole" type="primary" data-test="role-create" @click="openCreate">
        新建角色
      </el-button>
    </template>

    <template #dialogs>
      <el-drawer
        v-model="createVisible"
        title="新建角色"
        size="480px"
        data-test="role-create-drawer"
      >
        <el-alert
          v-if="createError"
          type="error"
          :closable="false"
          show-icon
          :title="createError"
        />
        <p v-if="createRequestId" class="request-id">请求编号：{{ createRequestId }}</p>

        <el-form class="role-form" label-position="top" @submit.prevent="submitCreate">
          <el-form-item label="所属租户" required>
            <el-select
              v-model="createForm.tenantId"
              placeholder="请选择所属租户"
              data-test="role-create-tenant"
              :loading="tenantOptionsQuery.isPending.value"
            >
              <el-option
                v-for="tenantOption in tenants"
                :key="tenantOption.id"
                :label="tenantOption.name"
                :value="tenantOption.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="角色名称" required>
            <el-input v-model="createForm.name" maxlength="64" data-test="role-create-name" />
          </el-form-item>

          <el-form-item label="角色说明">
            <el-input
              v-model="createForm.description"
              type="textarea"
              :rows="3"
              maxlength="255"
              show-word-limit
              data-test="role-create-description"
            />
          </el-form-item>

          <div class="form-actions">
            <el-button @click="createVisible = false">取消</el-button>
            <el-button
              type="primary"
              data-test="role-create-submit"
              :disabled="!canSubmitCreate"
              :loading="creating"
              @click="submitCreate"
            >
              创建角色
            </el-button>
          </div>
        </el-form>
      </el-drawer>

      <el-drawer v-model="editVisible" title="编辑角色" size="480px" data-test="role-edit-drawer">
        <el-alert v-if="editError" type="error" :closable="false" show-icon :title="editError" />
        <p v-if="editRequestId" class="request-id">请求编号：{{ editRequestId }}</p>

        <el-descriptions v-if="editTarget" :column="1" border class="role-summary">
          <el-descriptions-item label="所属租户">
            {{ tenantName(editTarget.tenant_id) }}
          </el-descriptions-item>
        </el-descriptions>

        <el-form class="role-form" label-position="top" @submit.prevent="submitEdit">
          <el-form-item label="角色名称" required>
            <el-input v-model="editForm.name" maxlength="64" data-test="role-edit-name" />
          </el-form-item>

          <el-form-item label="角色说明">
            <el-input
              v-model="editForm.description"
              type="textarea"
              :rows="3"
              maxlength="255"
              show-word-limit
              data-test="role-edit-description"
            />
          </el-form-item>

          <el-form-item label="状态">
            <el-select v-model="editForm.status" data-test="role-edit-status">
              <el-option label="启用" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
          </el-form-item>

          <div class="form-actions">
            <el-button @click="editVisible = false">取消</el-button>
            <el-button
              type="primary"
              data-test="role-edit-submit"
              :disabled="!canSubmitEdit"
              :loading="updating"
              @click="submitEdit"
            >
              保存更改
            </el-button>
          </div>
        </el-form>
      </el-drawer>

      <el-drawer
        v-model="permissionVisible"
        :title="permissionDrawerTitle"
        size="min(560px, 100%)"
        data-test="role-permission-drawer"
      >
        <el-alert
          v-if="permissionError"
          type="error"
          :closable="false"
          show-icon
          :title="permissionError"
        />
        <p v-if="permissionRequestId" class="request-id">请求编号：{{ permissionRequestId }}</p>

        <div class="permission-summary">
          <div>
            <p class="permission-role-name">{{ permissionTarget?.name }}</p>
            <p class="permission-copy">{{ permissionCopy }}</p>
          </div>
          <span class="permission-count">已选 {{ selectedPermissionCount }} 项</span>
        </div>

        <el-input
          v-model="permissionKeyword"
          class="permission-search"
          clearable
          placeholder="搜索权限名称、资源或动作"
          data-test="role-permission-search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div v-if="permissionLoading" class="permission-state">
          <el-skeleton :rows="6" animated />
        </div>

        <el-alert
          v-else-if="permissionListError"
          class="permission-state"
          type="error"
          :closable="false"
          show-icon
          :title="permissionListError.message"
        />

        <div v-else-if="permissionGroups.length === 0" class="permission-state">
          <el-empty description="没有找到符合条件的权限" />
        </div>

        <div v-else class="permission-groups" data-test="role-permission-list">
          <section v-for="group in permissionGroups" :key="group.resource" class="permission-group">
            <header class="permission-group-header">
              <div>
                <strong>{{ group.resource }}</strong>
                <span>{{ group.items.length }} 项权限</span>
              </div>
              <el-checkbox
                :model-value="groupSelected(group)"
                :indeterminate="groupIndeterminate(group)"
                :disabled="permissionReadonly"
                @change="toggleGroup(group, $event)"
              >
                全选
              </el-checkbox>
            </header>

            <div class="permission-options">
              <el-checkbox
                v-for="permission in group.items"
                :key="permission.id"
                :model-value="permissionSelection.includes(permission.id)"
                :value="permission.id"
                :disabled="permissionReadonly"
                :data-test="`role-permission-${permission.id}`"
                @change="togglePermission(permission.id, $event)"
              >
                <span>{{ permission.name }}</span>
                <el-tag size="small" type="info">{{ permission.action }}</el-tag>
              </el-checkbox>
            </div>
          </section>
        </div>

        <template #footer>
          <el-button @click="permissionVisible = false">
            {{ permissionReadonly ? '关闭' : '取消' }}
          </el-button>
          <el-button
            v-if="!permissionReadonly"
            type="primary"
            data-test="role-permission-submit"
            :disabled="permissionLoading || permissionListError !== null"
            :loading="assigningPermissions"
            @click="submitPermissions"
          >
            保存权限
          </el-button>
        </template>
      </el-drawer>
    </template>
  </ManagementPage>
</template>

<style scoped>
.roles-table {
  min-width: 1120px;
}

.role-identity {
  display: grid;
  gap: 2px;
}

.role-identity strong {
  font-weight: var(--jp-font-weight-emphasis);
}

.role-identity-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.role-code {
  color: var(--jp-color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--jp-font-size-caption);
}

.role-identity span {
  overflow: hidden;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-form {
  margin-top: 16px;
}

.role-form :deep(.el-select),
.role-form :deep(.el-textarea) {
  width: 100%;
}

.role-summary {
  margin-top: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.permission-summary {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-top: 4px;
}

.permission-role-name {
  margin: 0;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
}

.permission-copy {
  margin: 4px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.permission-count {
  flex: none;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.permission-search {
  margin-top: 16px;
}

.permission-state {
  margin-top: 16px;
}

.permission-groups {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.permission-group {
  overflow: hidden;
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.permission-group-header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--jp-color-app-bg);
  border-bottom: 1px solid var(--jp-color-hairline);
}

.permission-group-header > div {
  display: grid;
  gap: 2px;
}

.permission-group-header strong {
  color: var(--jp-color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--jp-font-size-caption);
  font-weight: var(--jp-font-weight-emphasis);
}

.permission-group-header span {
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.permission-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  padding: 12px;
}

.permission-options :deep(.el-checkbox) {
  min-width: 0;
  margin-right: 0;
}

.permission-options :deep(.el-checkbox__label) {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

@media (max-width: 640px) {
  .permission-summary {
    flex-direction: column;
  }

  .permission-options {
    grid-template-columns: 1fr;
  }
}
</style>
