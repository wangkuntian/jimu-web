<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Search } from '@lucide/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  assignTenantPlan,
  createTenant,
  deleteTenant,
  listPlans,
  listTenants,
  updateTenant,
} from '../api'
import { buildTenantListQuery, clampPage } from '../params'
import type { TenantFilters } from '../params'
import { resolvePlanName } from '../plan-name'
import { apiResource } from '../../../shared/api/config'
import { ApiError, ErrorCode } from '../../../shared/api/unwrap'
import type { Plan, Tenant } from '../../../shared/api/types'
import { ensureIdentity, getIdentityStatus } from '../../../shared/auth/identity'
import { hasPermission } from '../../../shared/auth/permission'
import ManagementPage from '../../../shared/components/ManagementPage.vue'

const queryClient = useQueryClient()

// 权限点用后端实际请求路径（不是契约的路径键）；身份未加载时 hasPermission 一律 false。
const canView = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
const canCreate = computed(() => hasPermission(apiResource('/tenants'), 'POST'))
// 只是「能不能读套餐列表」，用来决定是否请求；行内「分配套餐」另有自己的 PUT 权限。
const canListPlans = computed(() => hasPermission(apiResource('/tenant-plans'), 'GET'))
// 身份不可用 ≠ 没有权限：500/网络/非 2001 的 404 会让身份为 null，hasPermission 必然 false。
const identityStatus = computed(() => getIdentityStatus())

const filters = reactive<TenantFilters>({
  page: 1,
  pageSize: 20,
  sort: 'id',
  order: 'desc',
  keyword: '',
  status: '',
})

/** 输入框草稿：只有点「搜索」/回车才落到 filters，避免每敲一个字就打一次后端。 */
const keywordDraft = ref('')

const listQuery = computed(() => buildTenantListQuery(filters))

const tenantsQuery = useQuery({
  queryKey: ['tenants', listQuery],
  queryFn: () => listTenants(listQuery.value),
  // 无 GET 权限时不发请求：注定 403 的调用没有意义。
  enabled: canView,
})

// 无分配权限时不请求套餐列表。
const plansQuery = useQuery({
  queryKey: ['tenant-plans'],
  queryFn: listPlans,
  enabled: canListPlans,
})

const plans = computed<Plan[]>(() => plansQuery.data.value ?? [])
const items = computed<Tenant[]>(() => tenantsQuery.data.value?.items ?? [])
const total = computed(() => tenantsQuery.data.value?.total ?? 0)

const listError = computed(() => {
  const error = tenantsQuery.error.value
  return error instanceof ApiError ? error : null
})

const listErrorMessage = computed(() => listError.value?.message ?? '加载租户列表失败')
const listErrorRequestId = computed(() => listError.value?.requestId ?? '')

/**
 * 互斥状态，判定顺序即优先级：
 * 无权限/身份不可用 → 加载中 → 错误 → 空 → 表格。
 *
 * 身份不可用（500/网络/非 2001 的 404）时身份为 null、`hasPermission` 必然 false，
 * 直接渲染无权限态会把一次后端抖动伪装成权限被收回；只有身份成功加载（`'ok'`）
 * 且仍缺 GET 权限，或列表本身回答 1003，才渲染无权限页。
 * 403 留在本路由渲染说明，不跳登录；只有 401 才由 API 层走刷新/登录。
 */
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
    // 身份仍在引导中：先给加载态，避免把「尚未加载」误报成无权限。
    return 'loading'
  }
  if (tenantsQuery.isPending.value) {
    return 'loading'
  }
  if (tenantsQuery.isError.value) {
    return 'error'
  }
  if (items.value.length === 0) {
    return 'empty'
  }
  return 'table'
})

/** 任何筛选/排序变化都回到第 1 页：否则会拿旧页码去查新结果集。 */
function resetPage(): void {
  filters.page = 1
}

/**
 * 结果集缩小时页码可能越界：后端对越界页返回空数组 + 真实 total，
 * 不纠正就会把「本页没有数据」渲染成「一个租户都没有」。
 */
watch([items, total], ([rows, count]) => {
  if (rows.length > 0 || count <= 0) {
    return
  }
  const clamped = clampPage(filters.page, filters.pageSize, count)
  if (clamped !== filters.page) {
    filters.page = clamped
  }
})

function applyKeyword(): void {
  filters.keyword = keywordDraft.value
  filters.page = 1
}

/** 身份引导重试：成功后 canView 变为 true，列表查询会自动放行。 */
async function retryIdentity(): Promise<void> {
  await ensureIdentity()
}

function canUpdate(row: Tenant): boolean {
  return hasPermission(apiResource(`/tenants/${row.id}`), 'PUT')
}

function canDelete(row: Tenant): boolean {
  return hasPermission(apiResource(`/tenants/${row.id}`), 'DELETE')
}

/** 分配套餐按它自己的请求路径判权：`PUT /api/v1/tenants/{id}/plan`。 */
function canAssignPlan(row: Tenant): boolean {
  return hasPermission(apiResource(`/tenants/${row.id}/plan`), 'PUT')
}

/** 把任意异常归一成「后端文案 + 请求编号」，对话框与消息提示共用。 */
function describeError(error: unknown): { message: string; requestId: string } {
  if (error instanceof ApiError) {
    return { message: error.message, requestId: error.requestId ?? '' }
  }
  return { message: '网络异常，请重试', requestId: '' }
}

function withRequestId(message: string, requestId: string): string {
  return requestId === '' ? message : `${message}（请求编号：${requestId}）`
}

function invalidateList(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['tenants'] })
}

const createVisible = ref(false)
const createForm = reactive({ code: '', name: '' })
const createError = ref('')
const createRequestId = ref('')

const canSubmitCreate = computed(
  () => createForm.code.trim() !== '' && createForm.name.trim() !== '',
)

const { isPending: creating, mutateAsync: createTenantAsync } = useMutation({
  mutationFn: (input: { code: string; name: string }) => createTenant(input),
  onSuccess: invalidateList,
})

function openCreate(): void {
  createForm.code = ''
  createForm.name = ''
  createError.value = ''
  createRequestId.value = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  createError.value = ''
  createRequestId.value = ''

  try {
    await createTenantAsync({ code: createForm.code.trim(), name: createForm.name.trim() })
    createVisible.value = false
    ElMessage.success('租户已创建')
  } catch (error) {
    // 失败不关闭对话框，让用户能改完重试。
    const info = describeError(error)
    createError.value = info.message
    createRequestId.value = info.requestId
  }
}

const editVisible = ref(false)
const editForm = reactive<{ id: string; name: string; status: 0 | 1 }>({
  id: '',
  name: '',
  status: 1,
})
const editError = ref('')
const editRequestId = ref('')

const canSubmitEdit = computed(() => editForm.name.trim() !== '')

const { isPending: updating, mutateAsync: updateTenantAsync } = useMutation({
  mutationFn: (input: { id: string; name: string; status: 0 | 1 }) =>
    updateTenant(input.id, { name: input.name, status: input.status }),
  onSuccess: invalidateList,
})

function openEdit(row: Tenant): void {
  editForm.id = row.id
  editForm.name = row.name
  editForm.status = row.status === 1 ? 1 : 0
  editError.value = ''
  editRequestId.value = ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  editError.value = ''
  editRequestId.value = ''

  try {
    await updateTenantAsync({
      id: editForm.id,
      name: editForm.name.trim(),
      status: editForm.status,
    })
    editVisible.value = false
    ElMessage.success('租户已更新')
  } catch (error) {
    const info = describeError(error)
    editError.value = info.message
    editRequestId.value = info.requestId
  }
}

const planVisible = ref(false)
const planForm = reactive<{ id: string; code: string; planId: number }>({
  id: '',
  code: '',
  planId: 0,
})
const planError = ref('')
const planRequestId = ref('')

const { isPending: assigning, mutateAsync: assignPlanAsync } = useMutation({
  mutationFn: (input: { id: string; planId: number }) => assignTenantPlan(input.id, input.planId),
  onSuccess: invalidateList,
})

function openPlan(row: Tenant): void {
  planForm.id = row.id
  planForm.code = row.code
  planForm.planId = row.plan_id
  planError.value = ''
  planRequestId.value = ''
  planVisible.value = true
}

async function submitPlan(): Promise<void> {
  planError.value = ''
  planRequestId.value = ''

  try {
    await assignPlanAsync({ id: planForm.id, planId: planForm.planId })
    planVisible.value = false
    ElMessage.success('套餐已更新')
  } catch (error) {
    const info = describeError(error)
    planError.value = info.message
    planRequestId.value = info.requestId
  }
}

const { mutateAsync: deleteTenantAsync } = useMutation({
  mutationFn: (id: string) => deleteTenant(id),
  onSuccess: invalidateList,
})

async function onDelete(row: Tenant): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后该租户不再可访问，且会保留其数据。确认删除？', '删除租户', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    // 用户取消，不是错误。
    return
  }

  try {
    await deleteTenantAsync(row.id)
    ElMessage.success('租户已删除')
  } catch (error) {
    // 默认租户（id=1/code=default）由后端保护并返回 5003；前端不预判、不硬编码该规则，
    // 直接展示后端文案与 request_id。
    const info = describeError(error)
    ElMessage.error(withRequestId(info.message, info.requestId))
  }
}
</script>

<template>
  <ManagementPage
    v-model:page="filters.page"
    title="租户管理"
    description="管理平台下的租户、状态与套餐归属。"
    title-id="tenants-title"
    test-id-prefix="tenants"
    :state="viewState"
    forbidden-title="没有访问租户管理的权限"
    forbidden-description="请让管理员为你的账号分配 /api/v1/tenants 的 GET 权限"
    :error-message="listErrorMessage"
    :error-request-id="listErrorRequestId"
    empty-description="还没有租户，先创建一个开始管理"
    :total="total"
    :page-size="filters.pageSize"
    :loading-rows="4"
    @retry-identity="retryIdentity"
    @retry-list="tenantsQuery.refetch()"
    @filter-submit="applyKeyword"
  >
    <template #filters>
      <el-form-item label="关键词">
        <el-input
          v-model="keywordDraft"
          data-test="tenant-keyword"
          class="management-filter-input"
          placeholder="搜索编码或名称"
          clearable
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
          data-test="tenant-status"
          class="management-filter-select management-filter-select--narrow"
          placeholder="全部状态"
          @change="resetPage"
        >
          <el-option label="全部状态" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
      </el-form-item>

      <el-form-item label="排序">
        <el-select v-model="filters.sort" class="management-filter-select" @change="resetPage">
          <el-option label="按 ID" value="id" />
          <el-option label="按编码" value="code" />
          <el-option label="按创建时间" value="created_at" />
        </el-select>
      </el-form-item>

      <el-form-item label="方向">
        <el-select
          v-model="filters.order"
          class="management-filter-select management-filter-select--narrow"
          @change="resetPage"
        >
          <el-option label="降序" value="desc" />
          <el-option label="升序" value="asc" />
        </el-select>
      </el-form-item>

      <el-form-item class="management-filter-actions">
        <el-button @click="applyKeyword">搜索</el-button>
        <el-button
          v-if="canCreate && viewState === 'table'"
          type="primary"
          data-test="tenant-create"
          @click="openCreate"
        >
          新建租户
        </el-button>
      </el-form-item>
    </template>

    <template #table>
      <el-table class="tenants-table" :data="items" row-key="id">
        <el-table-column prop="code" label="编码" min-width="140" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'info'">
              {{ scope.row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="套餐" min-width="140">
          <template #default="scope">
            {{ resolvePlanName(scope.row.plan_id, plans) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="200" />
        <el-table-column label="操作" min-width="240">
          <template #default="scope">
            <el-button v-if="canUpdate(scope.row)" text type="primary" @click="openEdit(scope.row)">
              编辑
            </el-button>
            <el-button v-if="canDelete(scope.row)" text type="danger" @click="onDelete(scope.row)">
              删除
            </el-button>
            <el-button
              v-if="canAssignPlan(scope.row)"
              text
              type="primary"
              @click="openPlan(scope.row)"
            >
              分配套餐
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template #empty-action>
      <!-- 空状态的主操作也要按权限渲染：缺 POST 权限时它是注定 403 的动作。 -->
      <el-button v-if="canCreate" type="primary" data-test="tenant-create" @click="openCreate">
        新建租户
      </el-button>
    </template>

    <template #dialogs>
      <el-drawer
        v-model="createVisible"
        title="新建租户"
        size="480px"
        data-test="tenant-create-drawer"
      >
        <el-alert
          v-if="createError"
          type="error"
          :closable="false"
          show-icon
          :title="createError"
        />
        <p v-if="createRequestId" class="request-id">请求编号：{{ createRequestId }}</p>

        <el-form class="tenant-form" label-position="top">
          <el-form-item label="租户编码">
            <el-input v-model="createForm.code" placeholder="仅限字母、数字、短横线和下划线" />
          </el-form-item>
          <el-form-item label="租户名称">
            <el-input v-model="createForm.name" />
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="createVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="creating"
            :disabled="!canSubmitCreate"
            @click="submitCreate"
          >
            创建
          </el-button>
        </template>
      </el-drawer>

      <el-drawer v-model="editVisible" title="编辑租户" size="480px" data-test="tenant-edit-drawer">
        <el-alert v-if="editError" type="error" :closable="false" show-icon :title="editError" />
        <p v-if="editRequestId" class="request-id">请求编号：{{ editRequestId }}</p>

        <el-form class="tenant-form" label-position="top">
          <el-form-item label="租户名称">
            <el-input v-model="editForm.name" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="editForm.status">
              <el-option label="启用" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="editVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="updating"
            :disabled="!canSubmitEdit"
            @click="submitEdit"
          >
            保存
          </el-button>
        </template>
      </el-drawer>

      <el-dialog v-model="planVisible" title="分配套餐" width="480px">
        <el-alert v-if="planError" type="error" :closable="false" show-icon :title="planError" />
        <p v-if="planRequestId" class="request-id">请求编号：{{ planRequestId }}</p>

        <el-form class="tenant-form" label-position="top">
          <el-form-item :label="`租户 ${planForm.code} 的套餐`">
            <el-select v-model="planForm.planId" aria-label="套餐">
              <el-option label="取消套餐（不限）" :value="0" />
              <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
            </el-select>
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="planVisible = false">取消</el-button>
          <el-button type="primary" :loading="assigning" @click="submitPlan">保存</el-button>
        </template>
      </el-dialog>
    </template>
  </ManagementPage>
</template>

<style scoped>
.tenants-table {
  min-width: 960px;
}

.tenant-form {
  margin-top: 16px;
}

.tenant-form :deep(.el-select) {
  width: 100%;
}

.request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}
</style>
