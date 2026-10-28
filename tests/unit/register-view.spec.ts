import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { fetchAuthConfig, fetchCaptcha, register } from '../../src/features/auth/api'
import RegisterView from '../../src/features/auth/views/RegisterView.vue'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'

vi.mock('../../src/features/auth/api', () => ({
  fetchAuthConfig: vi.fn(),
  fetchCaptcha: vi.fn(),
  register: vi.fn(),
}))

const fetchAuthConfigMock = vi.mocked(fetchAuthConfig)
const registerMock = vi.mocked(register)
const fetchCaptchaMock = vi.mocked(fetchCaptcha)

const plainConfig = { public_registration: true, provisioning_enabled: false }
const provisioningConfig = { public_registration: true, provisioning_enabled: true }

function mountRegister(options: { attachTo?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register', component: RegisterView },
      { path: '/login', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  return {
    router,
    wrapper: mount(RegisterView, {
      attachTo: options.attachTo ? document.body : undefined,
      global: { plugins: [ElementPlus, router] },
    }),
  }
}

async function fillCredentials(wrapper: ReturnType<typeof mountRegister>['wrapper']) {
  await wrapper.find('[data-test="username"] input').setValue('alice')
  await wrapper.find('[data-test="password"] input').setValue('secret123')
}

describe('RegisterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchAuthConfigMock.mockResolvedValue(plainConfig)
  })

  it('renders the shared access shell with field guidance and a login link', async () => {
    const { wrapper } = mountRegister()
    await flushPromises()

    expect(wrapper.find('.auth-shell').exists()).toBe(true)
    expect(wrapper.find('.auth-context').exists()).toBe(true)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('创建账号')
    expect(wrapper.find('.brand-name').text()).toBe('Jimu Hub')
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('注册从清晰的账号边界开始')
    expect(wrapper.text()).not.toContain('ENTERPRISE ACCESS')
    expect(wrapper.text()).toContain('返回登录')
    expect(wrapper.find('[data-test="password-help"]').text()).toContain(
      '8–32 位且同时包含字母和数字',
    )
    expect(wrapper.find('[data-test="login-link"]').exists()).toBe(true)
  })

  it('focuses a validation summary when client-side validation fails', async () => {
    const { wrapper } = mountRegister({ attachTo: true })
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()

    const summary = wrapper.find('[data-test="validation-summary"]')
    expect(summary.exists()).toBe(true)
    expect(document.activeElement).toBe(summary.element)

    wrapper.unmount()
  })

  it('does not render a form when public registration is closed', async () => {
    fetchAuthConfigMock.mockResolvedValue({
      public_registration: false,
      provisioning_enabled: false,
    })
    const { wrapper } = mountRegister()
    await flushPromises()

    expect(wrapper.find('[data-test="register-closed"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="username"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('注册未开放')
    expect(wrapper.text()).toContain('返回登录')
    // 关闭态没有表单，因此也不可能发出注册请求
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('keeps the form closed when the config endpoint fails', async () => {
    fetchAuthConfigMock.mockRejectedValue(new ApiError(ErrorCode.unknown, '服务端返回了空响应'))
    const { wrapper } = mountRegister()
    await flushPromises()

    // fail-closed：开关未知时不能放行注册
    expect(wrapper.find('[data-test="register-closed"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="username"]').exists()).toBe(false)
  })

  it('registers a plain account without any tenant field', async () => {
    registerMock.mockResolvedValue({
      user: {
        id: 7,
        username: 'alice',
        status: 1,
        tenant_id: 1,
        created_at: '',
        updated_at: '',
        email: '',
        phone: '',
      },
    })
    const { router, wrapper } = mountRegister()
    await flushPromises()

    expect(wrapper.find('[data-test="tenant-name"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tenant-code"]').exists()).toBe(false)

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 参数必须**不含** tenant_name / tenant_code：多传会被后端静默忽略，形状就不诚实了
    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(registerMock.mock.calls[0]![0]).toEqual({ username: 'alice', password: 'secret123' })
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.registered).toBe('1')
  })

  it('requires tenant_name in provisioning mode and sends the optional tenant_code', async () => {
    fetchAuthConfigMock.mockResolvedValue(provisioningConfig)
    registerMock.mockResolvedValue({
      user: {
        id: 7,
        username: 'alice',
        status: 1,
        tenant_id: 2,
        created_at: '',
        updated_at: '',
        email: '',
        phone: '',
      },
      tenant: { id: 2, code: 'acme', name: 'Acme', status: 1 },
    })
    const { router, wrapper } = mountRegister()
    await flushPromises()

    expect(wrapper.find('[data-test="tenant-name"]').exists()).toBe(true)

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // tenant_name 必填：空提交只应产生校验错误，不应发请求
    expect(registerMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('租户名称')

    await wrapper.find('[data-test="tenant-name"] input').setValue('Acme')
    await wrapper.find('[data-test="tenant-code"] input').setValue('acme')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(registerMock.mock.calls[0]![0]).toEqual({
      username: 'alice',
      password: 'secret123',
      tenant_name: 'Acme',
      tenant_code: 'acme',
    })
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('omits tenant_code from the payload when the optional field is left empty', async () => {
    fetchAuthConfigMock.mockResolvedValue(provisioningConfig)
    registerMock.mockResolvedValue({
      user: {
        id: 7,
        username: 'alice',
        status: 1,
        tenant_id: 2,
        created_at: '',
        updated_at: '',
        email: '',
        phone: '',
      },
      tenant: { id: 2, code: 'acme', name: 'Acme', status: 1 },
    })
    const { wrapper } = mountRegister()
    await flushPromises()

    await fillCredentials(wrapper)
    await wrapper.find('[data-test="tenant-name"] input').setValue('Acme')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 可选字段留空时不能发空串：后端会把它当成显式编码，形状就不诚实了。
    expect(registerMock.mock.calls[0]![0]).toEqual({
      username: 'alice',
      password: 'secret123',
      tenant_name: 'Acme',
    })
    expect(registerMock.mock.calls[0]![0]).not.toHaveProperty('tenant_code')
  })

  it('reveals the captcha field when the backend asks for one', async () => {
    registerMock.mockRejectedValueOnce(new ApiError(ErrorCode.captchaRequired, '需要图形验证码'))
    fetchCaptchaMock.mockResolvedValue({
      captcha_id: 'c1',
      captcha_image: 'data:image/png;base64,AA',
    })
    const { wrapper } = mountRegister()
    await flushPromises()

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-test="captcha"]').exists()).toBe(true)
    expect(fetchCaptchaMock).toHaveBeenCalled()

    await wrapper.find('[data-test="captcha"] input').setValue('1234')
    registerMock.mockResolvedValueOnce({
      user: {
        id: 7,
        username: 'alice',
        status: 1,
        tenant_id: 1,
        created_at: '',
        updated_at: '',
        email: '',
        phone: '',
      },
    })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(registerMock.mock.calls[1]![0]).toMatchObject({ captcha_id: 'c1', captcha_code: '1234' })
  })

  it('reports a taken username from the business code', async () => {
    registerMock.mockRejectedValueOnce(new ApiError(ErrorCode.userExists, '用户已存在'))
    const { wrapper } = mountRegister()
    await flushPromises()

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('该用户名已被占用')
    expect(wrapper.find('[data-test="username"]').exists()).toBe(true)
  })

  it('reports rate limiting from the http status', async () => {
    registerMock.mockRejectedValueOnce(new ApiError(ErrorCode.rateLimited, '注册请求过于频繁'))
    const { wrapper } = mountRegister()
    await flushPromises()

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('稍后再试')
  })
})
