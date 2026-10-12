import { createRouter, createWebHistory } from 'vue-router'

import { sessionGuard } from '../guards/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal',
    },
    // `/login` 路由由 Task 9 在创建 LoginView.vue 时一并注册。
    // 此处提前引用不存在的组件文件会让本步的 typecheck 失败。
    {
      path: '/portal',
      name: 'portal',
      component: () => import('../../layouts/PortalLayout.vue'),
      children: [
        {
          path: '',
          name: 'portal-home',
          component: () => import('../../views/PortalView.vue'),
        },
        {
          path: '/workspace',
          name: 'workspace',
          component: () => import('../../views/WorkspaceView.vue'),
        },
        {
          path: '/account/security',
          name: 'account-security',
          component: () => import('../../views/AccountSecurityView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(sessionGuard)

export default router
