import { mount } from '@vue/test-utils'
import ElementPlus, { ElPagination } from 'element-plus'
import { describe, expect, it } from 'vitest'

import ManagementPage from '../../src/shared/components/ManagementPage.vue'

function mountPage(
  state: 'forbidden' | 'identity-error' | 'loading' | 'error' | 'empty' | 'table',
) {
  return mount(ManagementPage, {
    props: {
      title: '用户管理',
      description: '管理平台用户、所属租户与访问角色。',
      titleId: 'users-title',
      testIdPrefix: 'users',
      state,
      forbiddenTitle: '没有访问用户管理的权限',
      forbiddenDescription: '请分配 /api/v1/users 的 GET 权限',
      errorMessage: '加载用户列表失败',
      errorRequestId: 'req-users',
      emptyDescription: '没有找到符合条件的用户',
      total: 41,
      page: 1,
      pageSize: 20,
    },
    slots: {
      filters: `
        <el-form-item label="用户名">
          <el-input data-test="users-filter" />
        </el-form-item>
      `,
      table: '<div data-test="users-slot-table">alice</div>',
      'empty-action': '<button data-test="users-empty-action">新建用户</button>',
      dialogs: '<div data-test="users-dialogs">dialog</div>',
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('ManagementPage', () => {
  it('renders the shared heading, filters, table surface, dialog slot, and pagination', async () => {
    const wrapper = mountPage('table')

    expect(wrapper.get('h1').text()).toBe('用户管理')
    expect(wrapper.text()).toContain('管理平台用户、所属租户与访问角色。')
    expect(wrapper.find('[data-test="users-filters"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="users-filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="users-table"]').text()).toContain('alice')
    expect(wrapper.find('[data-test="users-dialogs"]').exists()).toBe(true)

    const pagination = wrapper.findComponent(ElPagination)
    expect(pagination.exists()).toBe(true)
    pagination.vm.$emit('update:current-page', 2)
    expect(wrapper.emitted('update:page')).toEqual([[2]])
  })

  it('renders one shared forbidden state', () => {
    const wrapper = mountPage('forbidden')

    expect(wrapper.find('[data-test="users-forbidden"]').text()).toContain('没有访问用户管理的权限')
    expect(wrapper.find('[data-test="users-filters"]').exists()).toBe(false)
  })

  it('distinguishes an unavailable identity and exposes a retry action', async () => {
    const wrapper = mountPage('identity-error')

    expect(wrapper.find('[data-test="users-identity-error"]').exists()).toBe(true)
    await wrapper.find('[data-test="users-identity-retry"]').trigger('click')
    expect(wrapper.emitted('retry-identity')).toEqual([[]])
  })

  it('renders a retryable list error with the request id', async () => {
    const wrapper = mountPage('error')

    expect(wrapper.find('[data-test="users-error"]').text()).toContain('req-users')
    await wrapper.find('[data-test="users-retry"]').trigger('click')
    expect(wrapper.emitted('retry-list')).toEqual([[]])
  })

  it('keeps filters visible while loading and uses the shared empty slot', () => {
    const loading = mountPage('loading')
    expect(loading.find('[data-test="users-filters"]').exists()).toBe(true)
    expect(loading.find('[data-test="users-loading"]').exists()).toBe(true)

    const empty = mountPage('empty')
    expect(empty.find('[data-test="users-empty"]').exists()).toBe(true)
    expect(empty.find('[data-test="users-empty-action"]').exists()).toBe(true)
  })
})
