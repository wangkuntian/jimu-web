import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import TenantsView from '../../src/features/tenants/views/TenantsView.vue'
import { listPlans, listTenants } from '../../src/features/tenants/api'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'
import type { Identity } from '../../src/shared/api/types'

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
  id: 1,
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
})
