import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import TenantsView from '../../src/features/tenants/views/TenantsView.vue'
import { listPlans, listTenants } from '../../src/features/tenants/api'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'
import { clearIdentity, saveIdentity, setIdentityStatus } from '../../src/shared/auth/session'
import type { Identity } from '../../src/shared/api/types'

const { ensureIdentityMock } = vi.hoisted(() => ({ ensureIdentityMock: vi.fn() }))

// 身份引导的真实实现会走网络；视图只负责在不可用时重试，因此在这里替换成可断言的桩。
vi.mock('../../src/shared/auth/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/auth/identity')>()
  return { ...actual, ensureIdentity: ensureIdentityMock }
})

vi.mock('../../src/features/tenants/api', () => ({
  listTenants: vi.fn(),
  listPlans: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  deleteTenant: vi.fn(),
  assignTenantPlan: vi.fn(),
}))

const listTenantsMock = vi.mocked(listTenants)
const listPlansMock = vi.mocked(listPlans)

const tenant = {
  id: '1',
  code: 'default',
  name: '默认租户',
  status: 1,
  plan_id: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const adminIdentity: Identity = {
  user: { id: 1, username: 'admin', status: 1, tenant_id: 1, created_at: '2026-10-19T00:00:00Z' },
  roles: ['超级管理员'],
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'POST' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

/** 只有查看权限：能进页面、能看到空状态，但不该看到任何「新建租户」入口。 */
const viewerIdentity: Identity = {
  ...adminIdentity,
  permissions: [{ resource: '/api/v1/tenants', action: 'GET' }],
}

/** 能看租户、能读套餐列表，但没有 `/api/v1/tenants/*` 的 `PUT`：行内「分配套餐」是注定 403 的动作。 */
const plansReaderIdentity: Identity = {
  ...adminIdentity,
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

/** 有 `/api/v1/tenants/*` 的 `PUT`、没有套餐列表的 `GET`：能分配套餐，但不该请求套餐列表。 */
const planAssignerIdentity: Identity = {
  ...adminIdentity,
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants/*', action: 'PUT' },
  ],
}

/** 拥有逐行 `PUT` / `DELETE` 权限：用来验证行内按钮的启用/禁用，而不是可见性。 */
const rowAdminIdentity: Identity = {
  ...adminIdentity,
  permissions: [
    { resource: '/api/v1/tenants', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'POST' },
    { resource: '/api/v1/tenants/*', action: 'PUT' },
    { resource: '/api/v1/tenants/*', action: 'DELETE' },
    { resource: '/api/v1/tenant-plans', action: 'GET' },
  ],
}

/** 后端以字符串输出的雪花 ID；路由与请求体必须原样保留，不能转回 number。 */
const largeTenantId = '370528943163310080'

function buttonByText(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

/** 真实点击时 el-pagination 先发 update:current-page（v-model 写入），再发 current-change。 */
function emitPaginationPage(wrapper: ReturnType<typeof mountView>, page: number): void {
  const pagination = wrapper.findComponent('[data-test="tenants-pagination"]') as VueWrapper
  pagination.vm.$emit('update:current-page', page)
  pagination.vm.$emit('current-change', page)
}

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platform/tenants', component: TenantsView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  return mount(TenantsView, {
    global: {
      plugins: [
        ElementPlus,
        router,
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  })
}

describe('TenantsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureIdentityMock.mockReset()
    clearIdentity()
    listPlansMock.mockResolvedValue([])
  })

  it('renders the no-permission state without issuing a request', async () => {
    saveIdentity({ ...adminIdentity, permissions: [] })
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="tenants-forbidden"]').exists()).toBe(true),
    )
    expect(listTenantsMock).not.toHaveBeenCalled()
  })

  it('renders the forbidden state when the list itself answers 403', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockRejectedValue(new ApiError(ErrorCode.forbidden, '无权限', 'req-7'))
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="tenants-forbidden"]').exists()).toBe(true),
    )
  })

  it('renders the empty state with a primary action', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="tenant-create"]').exists()).toBe(true)
  })

  it('renders the empty state without a create action when the POST permission is missing', async () => {
    // 设计文档要求按钮由权限驱动：缺 POST 权限时的「新建租户」是注定 403 的动作。
    saveIdentity(viewerIdentity)
    listTenantsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="tenant-create"]').exists()).toBe(false)
  })

  it('renders the table rows with the plan column mapped from plan_id', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockResolvedValue({
      items: [{ ...tenant, plan_id: 2 }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    listPlansMock.mockResolvedValue([
      { id: 2, code: 'pro', name: '专业版', max_users: 50, max_roles: 20, max_api_keys: 10 },
    ])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('default')
    expect(wrapper.text()).toContain('默认租户')
    expect(wrapper.text()).toContain('专业版')
  })

  it('renders a retryable error state that keeps the request id', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockRejectedValue(new ApiError(ErrorCode.internal, '服务器内部错误', 'req-8'))
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-error"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('req-8')
  })

  it('hides the assign-plan action when the PUT /tenants/{id}/plan permission is missing', async () => {
    // 行内动作按它自己的请求路径判权：有套餐列表 GET 不等于能改租户套餐。
    saveIdentity(plansReaderIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('分配套餐')
  })

  it('renders the assign-plan action from the PUT /tenants/{id}/plan grant without listing plans', async () => {
    saveIdentity(planAssignerIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('分配套餐')
    expect(listPlansMock).not.toHaveBeenCalled()
  })

  it('hides the edit and delete row actions without per-row PUT/DELETE permissions', async () => {
    // 行内「编辑」「删除」按各自请求路径逐行判权；只有列表 GET 时不渲染注定 403 的动作。
    saveIdentity(viewerIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).not.toContain('编辑')
    expect(labels).not.toContain('删除')
  })

  it('renders the edit and delete row actions with per-row PUT/DELETE permissions', async () => {
    saveIdentity(rowAdminIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).toContain('编辑')
    expect(labels).toContain('删除')
  })

  it('renders the loading state while the list request is pending', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockReturnValue(new Promise<never>(() => {}))
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="tenants-loading"]').exists()).toBe(true),
    )
    expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(false)
  })

  it('resets to page 1 when the status filter changes on a later page', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 41, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))

    emitPaginationPage(wrapper, 2)
    await vi.waitFor(() => expect(listTenantsMock.mock.lastCall?.[0]).toMatchObject({ page: 2 }))

    const statusSelect = wrapper.findComponent('[data-test="tenant-status"]') as VueWrapper
    statusSelect.vm.$emit('update:modelValue', 0)
    statusSelect.vm.$emit('change', 0)

    // 在 page 2 上换筛选条件必须回到第 1 页，否则会拿旧页码去查新结果集。
    await vi.waitFor(() =>
      expect(listTenantsMock.mock.lastCall?.[0]).toMatchObject({ page: 1, status: 0 }),
    )
  })

  it('clamps to the last valid page when the requested page comes back empty', async () => {
    saveIdentity(adminIdentity)
    listTenantsMock.mockImplementation(async (query) => {
      if (query.page === 1) {
        return { items: [tenant], total: 41, page: 1, pageSize: 20 }
      }
      if (query.page === 3) {
        return { items: [], total: 25, page: 3, pageSize: 20 }
      }
      return { items: [tenant], total: 25, page: query.page, pageSize: 20 }
    })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))

    emitPaginationPage(wrapper, 3)

    // 结果集缩到 25 条后，第 3 页越界：下一次请求必须落在最后有效页（ceil(25/20) = 2）。
    await vi.waitFor(() => expect(listTenantsMock.mock.lastCall?.[0]).toMatchObject({ page: 2 }))
    expect(listTenantsMock.mock.calls.map(([query]) => query.page)).toContain(3)
  })

  it('keeps row actions enabled for a large string id', async () => {
    saveIdentity(rowAdminIdentity)
    listTenantsMock.mockResolvedValue({
      items: [{ ...tenant, id: largeTenantId, code: 'runtime', name: '运行时租户' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="tenants-imprecise-id"]').exists()).toBe(false)

    for (const label of ['编辑', '删除', '分配套餐']) {
      const button = buttonByText(wrapper, label)
      expect(button).toBeDefined()
      expect(button?.attributes('disabled')).toBeUndefined()
    }
  })

  it('keeps row actions enabled and shows no warning for a safe-integer row id', async () => {
    saveIdentity(rowAdminIdentity)
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="tenants-imprecise-id"]').exists()).toBe(false)

    for (const label of ['编辑', '删除', '分配套餐']) {
      const button = buttonByText(wrapper, label)
      expect(button).toBeDefined()
      expect(button?.attributes('disabled')).toBeUndefined()
    }
  })

  it('renders the identity error state instead of the forbidden state when the identity is unavailable', async () => {
    // 身份不可用（500/网络/非 2001 的 404）时 identity 为 null、hasPermission 必然 false；
    // 把这种状态渲染成「没有权限」等于把一次后端抖动伪装成权限被收回。
    setIdentityStatus('unavailable')
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="tenants-identity-error"]').exists()).toBe(true),
    )
    expect(wrapper.find('[data-test="tenants-forbidden"]').exists()).toBe(false)
    expect(listTenantsMock).not.toHaveBeenCalled()
  })

  it('retries the identity bootstrap from the identity error state', async () => {
    setIdentityStatus('unavailable')
    ensureIdentityMock.mockImplementation(async () => {
      saveIdentity(adminIdentity)
      return 'ok'
    })
    listTenantsMock.mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="tenants-identity-retry"]').exists()).toBe(true),
    )
    await wrapper.find('[data-test="tenants-identity-retry"]').trigger('click')

    await vi.waitFor(() => expect(ensureIdentityMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(listTenantsMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(wrapper.find('[data-test="tenants-table"]').exists()).toBe(true))
  })
})
