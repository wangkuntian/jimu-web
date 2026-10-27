import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import { ElMessageBox } from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import UsersView from '../../src/features/users/views/UsersView.vue'
import ManagementPage from '../../src/shared/components/ManagementPage.vue'
import {
  createUser,
  deleteUser,
  listRoleOptions,
  listTenantOptions,
  listUsers,
  updateUser,
  assignUserRoles,
} from '../../src/features/users/api'
import type { Identity, RoleOption, User } from '../../src/shared/api/types'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'
import { clearIdentity, saveIdentity, setIdentityStatus } from '../../src/shared/auth/session'

const { ensureIdentityMock } = vi.hoisted(() => ({ ensureIdentityMock: vi.fn() }))

vi.mock('../../src/shared/auth/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/auth/identity')>()
  return { ...actual, ensureIdentity: ensureIdentityMock }
})

vi.mock('../../src/features/users/api', () => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  assignUserRoles: vi.fn(),
  listRoleOptions: vi.fn(),
  listTenantOptions: vi.fn(),
}))

const listUsersMock = vi.mocked(listUsers)
const listRoleOptionsMock = vi.mocked(listRoleOptions)
const listTenantOptionsMock = vi.mocked(listTenantOptions)
const createUserMock = vi.mocked(createUser)
const updateUserMock = vi.mocked(updateUser)
const deleteUserMock = vi.mocked(deleteUser)
const assignUserRolesMock = vi.mocked(assignUserRoles)
const mountedWrappers: Array<{ unmount: () => void }> = []

const user: User = {
  id: '370528943163310080',
  username: 'alice',
  email: 'alice@example.com',
  phone: '13800000000',
  status: 1,
  tenant: { id: '370528943163310081', name: 'Acme' },
  roles: [{ id: '370528943163310082', name: 'developer' }],
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const tenant = {
  id: '370528943163310081',
  code: 'acme',
  name: 'Acme',
  status: 1,
  plan_id: 0,
  created_at: '',
  updated_at: '',
}

const role = {
  id: '370528943163310082',
  name: 'developer',
  code: '',
  scope: 'tenant' as const,
  is_system: false,
}

const baseIdentity: Identity = {
  user: {
    id: 1,
    username: 'admin',
    status: 1,
    tenant_id: 1,
    created_at: '2026-10-19T00:00:00Z',
  },
  roles: ['超级管理员'],
  permissions: [],
}

const fullAdminIdentity: Identity = {
  ...baseIdentity,
  permissions: [
    { resource: '/api/v1/users', action: 'GET' },
    { resource: '/api/v1/users', action: 'POST' },
    { resource: '/api/v1/users/*', action: 'PUT' },
    { resource: '/api/v1/users/*', action: 'DELETE' },
    { resource: '/api/v1/users/*/roles', action: 'POST' },
    { resource: '/api/v1/roles/options', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'GET' },
  ],
}

const viewerIdentity: Identity = {
  ...baseIdentity,
  permissions: [{ resource: '/api/v1/users', action: 'GET' }],
}

const tenantUserAdminIdentity: Identity = {
  ...baseIdentity,
  permissions: [
    { resource: '/api/v1/users', action: 'GET' },
    { resource: '/api/v1/users', action: 'POST' },
    { resource: '/api/v1/roles/options', action: 'GET' },
  ],
}

function emitPaginationPage(wrapper: ReturnType<typeof mountView>, page: number): void {
  const pagination = wrapper.findComponent('[data-test="users-pagination"]') as VueWrapper
  pagination.vm.$emit('update:current-page', page)
  pagination.vm.$emit('current-change', page)
}

function mountView(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', component: UsersView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(UsersView, {
    global: {
      plugins: [ElementPlus, router, [VueQueryPlugin, { queryClient }]],
      stubs: {
        teleport: true,
        ElDrawer: {
          props: ['modelValue', 'title'],
          template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /></section>',
        },
        ElDialog: {
          props: ['modelValue', 'title'],
          template:
            '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>',
        },
        ElSelect: {
          props: ['modelValue', 'loading', 'multiple', 'disabled'],
          emits: ['update:modelValue', 'change'],
          template: '<div class="el-select-stub"><slot /></div>',
        },
        ElOption: {
          props: ['label', 'value'],
          template: '<div class="el-option-stub">{{ label }}</div>',
        },
      },
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('UsersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    ensureIdentityMock.mockReset()
    clearIdentity()
    listTenantOptionsMock.mockResolvedValue([tenant])
    listRoleOptionsMock.mockResolvedValue([role])
    createUserMock.mockResolvedValue(user)
    updateUserMock.mockResolvedValue()
    deleteUserMock.mockResolvedValue()
    assignUserRolesMock.mockResolvedValue()
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('renders the no-permission state without requesting users', async () => {
    saveIdentity(baseIdentity)
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="users-forbidden"]').exists()).toBe(true),
    )
    expect(listUsersMock).not.toHaveBeenCalled()
  })

  it('renders users with tenant, roles, and status', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    expect(wrapper.findComponent(ManagementPage).exists()).toBe(true)
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain('alice@example.com')
    expect(wrapper.text()).toContain('Acme')
    expect(wrapper.text()).toContain('developer')
    expect(wrapper.text()).toContain('启用')
  })

  it('renders an empty state with the create action only with POST permission', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="user-create"]').exists()).toBe(true)

    saveIdentity(viewerIdentity)
    const viewerWrapper = mountView()
    await vi.waitFor(() =>
      expect(viewerWrapper.find('[data-test="users-empty"]').exists()).toBe(true),
    )
    expect(viewerWrapper.find('[data-test="user-create"]').exists()).toBe(false)
  })

  it('resets to page 1 and filters by tenant and status', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 41, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    emitPaginationPage(wrapper, 2)
    await vi.waitFor(() => expect(listUsersMock.mock.lastCall?.[0]).toMatchObject({ page: 2 }))

    const tenantSelect = wrapper.findComponent('[data-test="user-tenant-filter"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)

    const statusSelect = wrapper.findComponent('[data-test="user-status-filter"]') as VueWrapper
    statusSelect.vm.$emit('update:modelValue', 0)
    statusSelect.vm.$emit('change', 0)

    await vi.waitFor(() =>
      expect(listUsersMock.mock.lastCall?.[0]).toMatchObject({
        page: 1,
        tenant_id: tenant.id,
        status: 0,
      }),
    )
  })

  it('hides row actions without their own granular permissions', async () => {
    saveIdentity(viewerIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).not.toContain('编辑')
    expect(labels).not.toContain('角色')
    expect(labels).not.toContain('停用')
  })

  it('clamps to the last valid page when the requested page comes back empty', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockImplementation(async (query) => {
      if (query.page === 1) {
        return { items: [user], total: 41, page: 1, pageSize: 20 }
      }
      if (query.page === 3) {
        return { items: [], total: 25, page: 3, pageSize: 20 }
      }
      return { items: [user], total: 25, page: query.page, pageSize: 20 }
    })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    emitPaginationPage(wrapper, 3)

    await vi.waitFor(() => expect(listUsersMock.mock.lastCall?.[0]).toMatchObject({ page: 2 }))
    expect(listUsersMock.mock.calls.map(([query]) => query.page)).toContain(3)
  })

  it('renders a retryable error with the request id', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockRejectedValue(new ApiError(ErrorCode.internal, '服务器内部错误', 'req-users'))
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-error"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('req-users')
  })

  it('distinguishes an unavailable identity from missing permission', async () => {
    setIdentityStatus('unavailable')
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="users-identity-error"]').exists()).toBe(true),
    )
    expect(wrapper.find('[data-test="users-forbidden"]').exists()).toBe(false)
    expect(listUsersMock).not.toHaveBeenCalled()
  })

  it('requires a tenant and submits the create payload with the selected role', async () => {
    const systemRole = {
      ...role,
      id: 'role-tenant-admin',
      name: '租户管理员',
      code: 'tenant_admin',
      is_system: true,
    }
    listRoleOptionsMock.mockResolvedValue([role, systemRole])
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper.find('[data-test="user-create"]').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="user-create-tenant"]').exists()).toBe(true),
    )

    const submit = wrapper.find('[data-test="user-create-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('input[data-test="user-create-username"]').setValue('bob')
    await wrapper.find('input[data-test="user-create-password"]').setValue('secret123')
    const tenantSelect = wrapper.findComponent('[data-test="user-create-tenant"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledWith(tenant.id))
    expect(wrapper.text()).toContain('租户管理员（系统）')

    const roleSelect = wrapper.findComponent('[data-test="user-create-roles"]') as VueWrapper
    roleSelect.vm.$emit('update:modelValue', [role.id])

    await submit.trigger('click')
    await vi.waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith({
        tenant_id: tenant.id,
        username: 'bob',
        password: 'secret123',
        email: '',
        phone: '',
        role_ids: [role.id],
      }),
    )
  })

  it('clears selected roles when the target tenant changes', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    listTenantOptionsMock.mockResolvedValue([
      tenant,
      { ...tenant, id: 'tenant-2', code: 'beta', name: 'Beta' },
    ])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper.find('[data-test="user-create"]').trigger('click')
    await wrapper.find('input[data-test="user-create-username"]').setValue('bob')
    await wrapper.find('input[data-test="user-create-password"]').setValue('secret123')

    const tenantSelect = wrapper.findComponent('[data-test="user-create-tenant"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledWith(tenant.id))

    const roleSelect = wrapper.findComponent('[data-test="user-create-roles"]') as VueWrapper
    roleSelect.vm.$emit('update:modelValue', [role.id])

    tenantSelect.vm.$emit('update:modelValue', 'tenant-2')
    tenantSelect.vm.$emit('change', 'tenant-2')
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenLastCalledWith('tenant-2'))
    await wrapper.find('[data-test="user-create-submit"]').trigger('click')

    await vi.waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-2',
          role_ids: [],
        }),
      ),
    )
  })

  it('creates a user inside the current tenant when tenant listing is not permitted', async () => {
    saveIdentity(tenantUserAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper.find('[data-test="user-create"]').trigger('click')

    expect(wrapper.find('[data-test="user-create-tenant"]').exists()).toBe(false)
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledWith(undefined))

    await wrapper.find('input[data-test="user-create-username"]').setValue('bob')
    await wrapper.find('input[data-test="user-create-password"]').setValue('secret123')
    const roleSelect = wrapper.findComponent('[data-test="user-create-roles"]') as VueWrapper
    roleSelect.vm.$emit('update:modelValue', [role.id])
    await wrapper.find('[data-test="user-create-submit"]').trigger('click')

    await vi.waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'bob',
          role_ids: [role.id],
        }),
      ),
    )
    expect(createUserMock.mock.lastCall?.[0]).not.toHaveProperty('tenant_id')
  })

  it('edits the mutable profile fields', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '编辑')
      ?.trigger('click')
    await wrapper.find('input[data-test="user-edit-email"]').setValue('new@example.com')
    await wrapper.find('input[data-test="user-edit-phone"]').setValue('13900000000')

    const statusSelect = wrapper.findComponent('[data-test="user-edit-status"]') as VueWrapper
    statusSelect.vm.$emit('update:modelValue', 0)

    await wrapper.find('[data-test="user-edit-submit"]').trigger('click')
    await vi.waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith(user.id, {
        status: 0,
        email: 'new@example.com',
        phone: '13900000000',
      }),
    )
  })

  it('replaces the complete role set from the role dialog', async () => {
    const secondRole = { ...role, id: 'role-2', name: 'reviewer' }
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    listRoleOptionsMock.mockResolvedValue([role, secondRole])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '角色')
      ?.trigger('click')
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledWith(user.tenant.id))

    const roleSelect = wrapper.findComponent('[data-test="user-role-select"]') as VueWrapper
    roleSelect.vm.$emit('update:modelValue', [secondRole.id])
    await wrapper.find('[data-test="user-role-submit"]').trigger('click')

    await vi.waitFor(() =>
      expect(assignUserRolesMock).toHaveBeenCalledWith(user.id, [secondRole.id]),
    )
  })

  it('renders platform roles returned for a default-tenant user', async () => {
    const platformUser = { ...user, tenant: { id: '1', name: '默认租户' } }
    const platformRole: RoleOption = {
      id: 'platform-role',
      name: '平台审计员',
      code: 'platform_auditor',
      scope: 'platform',
      is_system: true,
    }
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [platformUser], total: 1, page: 1, pageSize: 20 })
    listRoleOptionsMock.mockResolvedValue([platformRole])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '角色')
      ?.trigger('click')
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledWith('1'))

    expect(wrapper.text()).toContain('平台审计员（系统）')
    expect(wrapper.find('[data-test="user-role-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('uses active-only tenants for creation while keeping all tenants for filtering', async () => {
    const disabledTenant = {
      ...tenant,
      id: 'tenant-disabled',
      code: 'disabled',
      name: '已停用租户',
      status: 0,
    }
    listTenantOptionsMock.mockResolvedValue([tenant, disabledTenant])
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await vi.waitFor(() => expect(listTenantOptionsMock).toHaveBeenCalledTimes(1))
    expect(listTenantOptionsMock.mock.calls[0]).toEqual([])

    const filter = wrapper.findComponent('[data-test="user-tenant-filter"]')
    expect(filter.text()).toContain('Acme')
    expect(filter.text()).toContain('已停用租户')

    await wrapper.find('[data-test="user-create"]').trigger('click')
    const createTenant = wrapper.findComponent('[data-test="user-create-tenant"]')
    expect(createTenant.text()).toContain('Acme')
    expect(createTenant.text()).not.toContain('已停用租户')
  })

  it('reuses the shared tenant and role query keys for cross-page invalidation', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = mountView(queryClient)

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await vi.waitFor(() => expect(listTenantOptionsMock).toHaveBeenCalledTimes(1))

    await queryClient.invalidateQueries({ queryKey: ['tenants'] })
    await vi.waitFor(() => expect(listTenantOptionsMock).toHaveBeenCalledTimes(2))

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '角色')
      ?.trigger('click')
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledTimes(1))

    await queryClient.invalidateQueries({ queryKey: ['roles'] })
    await vi.waitFor(() => expect(listRoleOptionsMock).toHaveBeenCalledTimes(2))
  })

  it('shows a retryable error when tenant options fail', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    listTenantOptionsMock
      .mockRejectedValueOnce(
        new ApiError(ErrorCode.internal, '租户选项加载失败', 'req-tenant-options'),
      )
      .mockResolvedValueOnce([tenant])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    const error = await vi.waitFor(() => {
      const node = wrapper.find('[data-test="user-tenant-options-error"]')
      expect(node.exists()).toBe(true)
      return node
    })
    expect(error.text()).toContain('租户选项加载失败')
    expect(error.text()).toContain('req-tenant-options')

    await wrapper.find('[data-test="user-create"]').trigger('click')
    const tenantSelect = wrapper.findComponent('[data-test="user-create-tenant"]') as VueWrapper
    expect((tenantSelect.props() as { disabled?: boolean }).disabled).toBe(true)

    await error.find('button').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="user-tenant-options-error"]').exists()).toBe(false),
    )
    expect((tenantSelect.props() as { disabled?: boolean }).disabled).toBe(false)
  })

  it('disables create until failed role options are retried', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    listRoleOptionsMock
      .mockRejectedValueOnce(
        new ApiError(ErrorCode.internal, '角色选项加载失败', 'req-role-options'),
      )
      .mockResolvedValueOnce([role])
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper.find('[data-test="user-create"]').trigger('click')
    await wrapper.find('input[data-test="user-create-username"]').setValue('bob')
    await wrapper.find('input[data-test="user-create-password"]').setValue('secret123')
    const tenantSelect = wrapper.findComponent('[data-test="user-create-tenant"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)

    const error = await vi.waitFor(() => {
      const node = wrapper.find('[data-test="user-create-role-options-error"]')
      expect(node.exists()).toBe(true)
      return node
    })
    expect(error.text()).toContain('角色选项加载失败')
    expect(wrapper.find('[data-test="user-create-submit"]').attributes('disabled')).toBeDefined()

    await error.find('button').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="user-create-role-options-error"]').exists()).toBe(false),
    )
    expect(wrapper.find('[data-test="user-create-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('disables role assignment when role options fail', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    listRoleOptionsMock.mockRejectedValue(
      new ApiError(ErrorCode.internal, '角色选项加载失败', 'req-role-dialog'),
    )
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '角色')
      ?.trigger('click')

    const error = await vi.waitFor(() => {
      const node = wrapper.find('[data-test="user-role-options-error"]')
      expect(node.exists()).toBe(true)
      return node
    })
    expect(error.text()).toContain('角色选项加载失败')
    expect(wrapper.find('[data-test="user-role-submit"]').attributes('disabled')).toBeDefined()
  })

  it('stops a user with PUT and permanently deletes with DELETE', async () => {
    saveIdentity(fullAdminIdentity)
    listUsersMock.mockResolvedValue({ items: [user], total: 1, page: 1, pageSize: 20 })
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['roles'], { items: [], total: 0 })
    const wrapper = mountView(queryClient)

    await vi.waitFor(() => expect(wrapper.find('[data-test="users-table"]').exists()).toBe(true))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '停用')
      ?.trigger('click')

    await vi.waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('停用后该用户将无法登录'),
        '停用用户',
        expect.anything(),
      ),
    )
    await vi.waitFor(() => expect(updateUserMock).toHaveBeenLastCalledWith(user.id, { status: 0 }))

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '删除')
      ?.trigger('click')
    await vi.waitFor(() =>
      expect(confirm).toHaveBeenLastCalledWith(
        expect.stringContaining('删除后无法恢复'),
        '删除用户',
        expect.anything(),
      ),
    )
    await vi.waitFor(() => expect(deleteUserMock).toHaveBeenCalledWith(user.id))
    await vi.waitFor(() => expect(queryClient.getQueryState(['roles'])?.isInvalidated).toBe(true))
  })
})
