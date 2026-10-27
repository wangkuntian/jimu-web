import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import RolesView from '../../src/features/roles/views/RolesView.vue'
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getRolePermissions,
  listPermissions,
  listRoles,
  listTenantOptions,
  updateRole,
} from '../../src/features/roles/api'
import ManagementPage from '../../src/shared/components/ManagementPage.vue'
import type { Identity, Permission, Role, Tenant } from '../../src/shared/api/types'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'
import { clearIdentity, saveIdentity } from '../../src/shared/auth/session'

const { ensureIdentityMock } = vi.hoisted(() => ({ ensureIdentityMock: vi.fn() }))

vi.mock('../../src/shared/auth/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/auth/identity')>()
  return { ...actual, ensureIdentity: ensureIdentityMock }
})

vi.mock('../../src/features/roles/api', () => ({
  listRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  listPermissions: vi.fn(),
  getRolePermissions: vi.fn(),
  assignRolePermissions: vi.fn(),
  listTenantOptions: vi.fn(),
}))

const listRolesMock = vi.mocked(listRoles)
const createRoleMock = vi.mocked(createRole)
const updateRoleMock = vi.mocked(updateRole)
const deleteRoleMock = vi.mocked(deleteRole)
const listPermissionsMock = vi.mocked(listPermissions)
const getRolePermissionsMock = vi.mocked(getRolePermissions)
const assignRolePermissionsMock = vi.mocked(assignRolePermissions)
const listTenantOptionsMock = vi.mocked(listTenantOptions)

const tenant: Tenant = {
  id: '1',
  code: 'default',
  name: '默认租户',
  status: 1,
  plan_id: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const role: Role = {
  id: '370528943163310080',
  tenant_id: tenant.id,
  name: '运营管理员',
  description: '负责租户运营',
  code: '',
  scope: 'tenant',
  is_system: false,
  status: 1,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const systemRole: Role = {
  ...role,
  id: '370528943163310090',
  name: '平台超级管理员',
  description: '平台最高权限',
  code: 'platform_super_admin',
  scope: 'platform',
  is_system: true,
}

const userListPermission: Permission = {
  id: '370528943163420080',
  name: '用户列表',
  resource: '/api/v1/users',
  action: 'GET',
  created_at: '2026-10-19T00:00:00Z',
}

const userCreatePermission: Permission = {
  ...userListPermission,
  id: '370528943163420081',
  name: '用户创建',
  action: 'POST',
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

const roleAdminIdentity: Identity = {
  ...baseIdentity,
  permissions: [
    { resource: '/api/v1/roles', action: 'GET' },
    { resource: '/api/v1/roles', action: 'POST' },
    { resource: '/api/v1/roles/*', action: 'GET' },
    { resource: '/api/v1/roles/*', action: 'PUT' },
    { resource: '/api/v1/roles/*', action: 'DELETE' },
    { resource: '/api/v1/roles/*/permissions', action: 'GET' },
    { resource: '/api/v1/roles/*/permissions', action: 'POST' },
    { resource: '/api/v1/permissions', action: 'GET' },
    { resource: '/api/v1/tenants', action: 'GET' },
  ],
}

const viewerIdentity: Identity = {
  ...baseIdentity,
  permissions: [{ resource: '/api/v1/roles', action: 'GET' }],
}

function buttonByText(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

function emitPaginationPage(wrapper: ReturnType<typeof mountView>, page: number): void {
  const pagination = wrapper.findComponent('[data-test="roles-pagination"]') as VueWrapper
  pagination.vm.$emit('update:current-page', page)
  pagination.vm.$emit('current-change', page)
}

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', component: RolesView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })

  return mount(RolesView, {
    global: {
      plugins: [
        ElementPlus,
        router,
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
      stubs: {
        teleport: true,
        ElDrawer: {
          props: ['modelValue', 'title'],
          template:
            '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>',
        },
        ElSelect: {
          props: ['modelValue', 'loading'],
          emits: ['update:modelValue', 'change'],
          template: '<div class="el-select-stub"><slot /></div>',
        },
        ElOption: {
          props: ['label', 'value'],
          template: '<div class="el-option-stub">{{ label }}</div>',
        },
        ElCheckbox: {
          props: ['modelValue', 'value', 'indeterminate', 'disabled'],
          emits: ['update:modelValue', 'change'],
          template: '<label class="el-checkbox-stub"><slot /></label>',
        },
      },
    },
  })
}

describe('RolesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    ensureIdentityMock.mockReset()
    clearIdentity()
    listRolesMock.mockResolvedValue({ items: [role], total: 1, page: 1, pageSize: 20 })
    createRoleMock.mockResolvedValue(role)
    updateRoleMock.mockResolvedValue()
    deleteRoleMock.mockResolvedValue()
    listPermissionsMock.mockResolvedValue([userListPermission, userCreatePermission])
    getRolePermissionsMock.mockResolvedValue([userListPermission])
    assignRolePermissionsMock.mockResolvedValue()
    listTenantOptionsMock.mockResolvedValue([tenant])
  })

  it('renders the shared management page and role table', async () => {
    saveIdentity(roleAdminIdentity)
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    expect(wrapper.findComponent(ManagementPage).exists()).toBe(true)
    expect(wrapper.text()).toContain('运营管理员')
    expect(wrapper.text()).toContain('默认租户')
    expect(wrapper.text()).toContain('启用')
  })

  it('renders the no-permission state without requesting roles', async () => {
    saveIdentity(baseIdentity)
    const wrapper = mountView()

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="roles-forbidden"]').exists()).toBe(true),
    )
    expect(listRolesMock).not.toHaveBeenCalled()
  })

  it('filters by tenant, keyword, and status from the first page', async () => {
    saveIdentity(roleAdminIdentity)
    listRolesMock.mockResolvedValue({ items: [role], total: 41, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    emitPaginationPage(wrapper, 2)
    await vi.waitFor(() => expect(listRolesMock.mock.lastCall?.[0]).toMatchObject({ page: 2 }))

    const tenantSelect = wrapper.findComponent('[data-test="role-tenant-filter"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)
    await wrapper.find('input[data-test="role-keyword-filter"]').setValue('运营')
    const statusSelect = wrapper.findComponent('[data-test="role-status-filter"]') as VueWrapper
    statusSelect.vm.$emit('update:modelValue', 0)
    statusSelect.vm.$emit('change', 0)
    await wrapper.find('[data-test="role-search"]').trigger('click')

    await vi.waitFor(() =>
      expect(listRolesMock.mock.lastCall?.[0]).toMatchObject({
        page: 1,
        tenant_id: tenant.id,
        keyword: '运营',
        status: 0,
      }),
    )
  })

  it('requires a tenant when creating a role', async () => {
    saveIdentity(roleAdminIdentity)
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    await wrapper.find('[data-test="role-create"]').trigger('click')
    await wrapper.find('input[data-test="role-create-name"]').setValue('审计员')
    await wrapper.find('textarea[data-test="role-create-description"]').setValue('只读审计')

    const submit = wrapper.find('[data-test="role-create-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    const tenantSelect = wrapper.findComponent('[data-test="role-create-tenant"]') as VueWrapper
    tenantSelect.vm.$emit('update:modelValue', tenant.id)
    tenantSelect.vm.$emit('change', tenant.id)
    await vi.waitFor(() => expect(submit.attributes('disabled')).toBeUndefined())
    await submit.trigger('click')

    await vi.waitFor(() =>
      expect(createRoleMock).toHaveBeenCalledWith({
        tenant_id: tenant.id,
        name: '审计员',
        description: '只读审计',
      }),
    )
  })

  it('edits, stops, and permanently deletes a custom role', async () => {
    saveIdentity(roleAdminIdentity)
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    await buttonByText(wrapper, '编辑')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="role-edit-name"]').exists()).toBe(true))
    await wrapper.find('input[data-test="role-edit-name"]').setValue('运营主管')
    await wrapper.find('textarea[data-test="role-edit-description"]').setValue('更新职责')
    const statusSelect = wrapper.findComponent('[data-test="role-edit-status"]') as VueWrapper
    statusSelect.vm.$emit('update:modelValue', 1)
    await wrapper.find('[data-test="role-edit-submit"]').trigger('click')

    await vi.waitFor(() =>
      expect(updateRoleMock).toHaveBeenCalledWith(role.id, {
        name: '运营主管',
        description: '更新职责',
        status: 1,
      }),
    )

    buttonByText(wrapper, '停用')?.trigger('click')
    await vi.waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('停用后该角色不再授予权限'),
        '停用角色',
        expect.anything(),
      ),
    )
    await vi.waitFor(() =>
      expect(updateRoleMock).toHaveBeenLastCalledWith(role.id, {
        name: role.name,
        description: role.description,
        status: 0,
      }),
    )

    buttonByText(wrapper, '删除')?.trigger('click')
    await vi.waitFor(() =>
      expect(confirm).toHaveBeenLastCalledWith(
        expect.stringContaining('删除后无法恢复'),
        '删除角色',
        expect.anything(),
      ),
    )
    await vi.waitFor(() => expect(deleteRoleMock).toHaveBeenCalledWith(role.id))
  })

  it('loads current permissions and saves the complete selection', async () => {
    saveIdentity(roleAdminIdentity)
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    await buttonByText(wrapper, '权限')?.trigger('click')

    await vi.waitFor(() => expect(getRolePermissionsMock).toHaveBeenCalledWith(role.id))
    await vi.waitFor(() => expect(listPermissionsMock).toHaveBeenCalled())
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="role-permission-list"]').exists()).toBe(true),
    )
    const selected = wrapper.findComponent(
      `[data-test="role-permission-${userListPermission.id}"]`,
    ) as VueWrapper
    expect(selected.props()).toMatchObject({ modelValue: true })
    const unselected = wrapper.findComponent(
      `[data-test="role-permission-${userCreatePermission.id}"]`,
    ) as VueWrapper
    expect(unselected.props()).toMatchObject({ modelValue: false })
    unselected.vm.$emit('change', true)
    await wrapper.find('[data-test="role-permission-submit"]').trigger('click')

    await vi.waitFor(() =>
      expect(assignRolePermissionsMock).toHaveBeenCalledWith(role.id, [
        userListPermission.id,
        userCreatePermission.id,
      ]),
    )
  })

  it('shows system role metadata and only allows read-only permission inspection', async () => {
    saveIdentity(roleAdminIdentity)
    listRolesMock.mockResolvedValue({ items: [systemRole], total: 1, page: 1, pageSize: 20 })
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('平台超级管理员')
    expect(wrapper.text()).toContain('platform_super_admin')
    expect(wrapper.text()).toContain('系统')
    expect(wrapper.text()).toContain('平台')
    expect(buttonByText(wrapper, '编辑')).toBeUndefined()
    expect(buttonByText(wrapper, '停用')).toBeUndefined()
    expect(buttonByText(wrapper, '删除')).toBeUndefined()

    await buttonByText(wrapper, '查看权限')?.trigger('click')
    await vi.waitFor(() => expect(getRolePermissionsMock).toHaveBeenCalledWith(systemRole.id))
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="role-permission-list"]').exists()).toBe(true),
    )

    expect(wrapper.text()).toContain('系统角色的权限由后端维护，不可在此修改')
    expect(wrapper.find('[data-test="role-permission-submit"]').exists()).toBe(false)
    const checkbox = wrapper.findComponent(
      `[data-test="role-permission-${userListPermission.id}"]`,
    ) as VueWrapper
    expect(checkbox.props()).toMatchObject({ modelValue: true, disabled: true })
    expect(assignRolePermissionsMock).not.toHaveBeenCalled()
  })

  it('hides row actions without their own permission points', async () => {
    saveIdentity(viewerIdentity)
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-table"]').exists()).toBe(true))
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).not.toContain('编辑')
    expect(labels).not.toContain('权限')
    expect(labels).not.toContain('停用')
  })

  it('renders a retryable list error with the request id', async () => {
    saveIdentity(roleAdminIdentity)
    listRolesMock.mockRejectedValue(new ApiError(ErrorCode.internal, '服务器内部错误', 'req-role'))
    const wrapper = mountView()

    await vi.waitFor(() => expect(wrapper.find('[data-test="roles-error"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('req-role')
  })
})
