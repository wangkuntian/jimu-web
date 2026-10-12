import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import LoginView from '../../src/features/auth/views/LoginView.vue'

// 必须注册 Element Plus：el-form-item 的 label 由组件渲染，未注册时
// 只会得到未解析的自定义元素，label 文本不会出现在 wrapper.text() 中。
// 同时注册一个内存 history 的 router：组件在 setup 阶段就调用
// useRoute/useRouter，缺少提供者会打印 injection 警告，而本用例只关心
// 标签渲染与字段默认可见性，不需要真实导航。
function mountLogin() {
  const router = createRouter({
    history: createMemoryHistory(),
    // 兜底路由用于吞掉 createRouter 对初始位置（""）的解析，避免打印
    // "No match found" 警告；组件本身不关心匹配结果。
    routes: [
      { path: '/login', component: LoginView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })

  return mount(LoginView, {
    global: {
      plugins: [ElementPlus, router],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('LoginView', () => {
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
})
