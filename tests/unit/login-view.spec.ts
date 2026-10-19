import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { fetchAuthConfig, fetchCaptcha, login } from '../../src/features/auth/api'
import LoginView from '../../src/features/auth/views/LoginView.vue'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'

// LoginView 只通过 '../api' 消费这三个函数；真实请求与会话存储与本文件无关，
// 打桩后才能驱动「后端要求验证码、验证码接口却失败」这条路径。
vi.mock('../../src/features/auth/api', () => ({
  fetchAuthConfig: vi.fn(),
  fetchCaptcha: vi.fn(),
  login: vi.fn(),
}))

// 必须注册 Element Plus：el-form-item 的 label 由组件渲染，未注册时
// 只会得到未解析的自定义元素，label 文本不会出现在 wrapper.text() 中。
// 同时注册一个内存 history 的 router：组件在 setup 阶段就调用
// useRoute/useRouter，缺少提供者会打印 injection 警告，而本用例只关心
// 标签渲染与字段默认可见性，不需要真实导航。
// onError 接收 Vue 的 errorHandler 回调：异步事件处理函数抛出的异常会走到这里，
// 用它断言 onSubmit 没有把失败泄漏成未处理拒绝。
function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    // 兜底路由用于吞掉 createRouter 对初始位置（""）的解析，避免打印
    // "No match found" 警告；组件本身不关心匹配结果。
    routes: [
      { path: '/login', component: LoginView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

function mountLogin(onError?: (error: unknown) => void) {
  const router = createTestRouter()

  return mount(LoginView, {
    global: {
      plugins: [ElementPlus, router],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      config: { errorHandler: onError },
    },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAuthConfig).mockResolvedValue({
      public_registration: false,
      provisioning_enabled: false,
    })
  })

  it('renders visible labels, not placeholders', () => {
    const wrapper = mountLogin()

    expect(wrapper.text()).toContain('用户名')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).toContain('记住此设备')
  })

  it('hides the totp and captcha fields by default', () => {
    const wrapper = mountLogin()

    expect(wrapper.find('[data-test="totp"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="captcha"]').exists()).toBe(false)
  })

  it('keeps a failed captcha load visible and retryable', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(ErrorCode.captchaRequired, '需要图形验证码'))
      .mockRejectedValueOnce(new ApiError(ErrorCode.captchaInvalid, '验证码错误'))
    vi.mocked(fetchCaptcha).mockRejectedValueOnce(new Error('captcha endpoint down'))

    const errors: unknown[] = []
    const wrapper = mountLogin((error) => errors.push(error))

    // 第一次提交：后端要求图形验证码，但验证码接口同时不可用。
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(errors).toHaveLength(0)
    expect(wrapper.find('[data-test="captcha"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('验证码加载失败，请重试')

    // 重试：验证码接口恢复，字段进入可用状态。
    vi.mocked(fetchCaptcha).mockResolvedValue({
      captcha_id: 'c1',
      captcha_image: 'data:image/png;base64,AA',
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('验证码错误，请重新输入')
    expect(wrapper.find('.captcha-image').attributes('src')).toBe('data:image/png;base64,AA')
    expect(errors).toHaveLength(0)
  })

  it('resubmits the login with the typed totp code when mfa is required', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(ErrorCode.mfaRequired, '需要 TOTP 验证码'))
      .mockResolvedValueOnce({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })

    const wrapper = mountLogin()

    await wrapper.find('input[autocomplete="username"]').setValue('alice')
    await wrapper.find('input[autocomplete="current-password"]').setValue('secret123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-test="totp"]').exists()).toBe(true)

    await wrapper.find('[data-test="totp"] input').setValue('654321')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 断言真实调用参数：删掉 totp_code 的发送会让本用例失败。
    expect(vi.mocked(login)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(login).mock.calls[1]![0]).toMatchObject({
      username: 'alice',
      password: 'secret123',
      totp_code: '654321',
    })
  })

  it('reports an invalid totp code and keeps the field available', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(ErrorCode.mfaRequired, '需要 TOTP 验证码'))
      .mockRejectedValueOnce(new ApiError(ErrorCode.invalidMfa, '验证码无效'))

    const wrapper = mountLogin()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await wrapper.find('[data-test="totp"] input').setValue('000000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('验证码无效，请重新输入')
    expect(wrapper.find('[data-test="totp"]').exists()).toBe(true)
  })

  it('ignores an off-site redirect target and falls back to the portal', async () => {
    const router = createTestRouter()
    await router.push({ path: '/login', query: { redirect: '//evil.example' } })
    await router.isReady()

    vi.mocked(login).mockResolvedValueOnce({
      access_token: 'a1',
      refresh_token: 'r1',
      expires_in: 1800,
    })

    const wrapper = mount(LoginView, {
      global: {
        plugins: [ElementPlus, router],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/portal')
  })

  it('hides the register entry when public registration is closed', async () => {
    vi.mocked(fetchAuthConfig).mockResolvedValue({
      public_registration: false,
      provisioning_enabled: false,
    })
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('[data-test="register-link"]').exists()).toBe(false)
  })

  it('shows the register entry and the success notice when the backend allows it', async () => {
    vi.mocked(fetchAuthConfig).mockResolvedValue({
      public_registration: true,
      provisioning_enabled: false,
    })
    const router = createTestRouter()
    await router.push({ path: '/login', query: { registered: '1' } })
    await router.isReady()

    const wrapper = mount(LoginView, {
      global: {
        plugins: [ElementPlus, router],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-test="register-link"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('注册成功')
  })
})
