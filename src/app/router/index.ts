import { createRouter, createWebHistory } from 'vue-router'

import { LOGIN_ROUTE, sessionGuard } from '../guards/session'
import { onSessionExpired } from '../../shared/auth/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal',
    },
    {
      path: LOGIN_ROUTE,
      name: 'login',
      component: () => import('../../features/auth/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../../features/auth/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/portal',
      name: 'portal',
      component: () => import('../../layouts/PortalLayout.vue'),
      children: [
        {
          path: '',
          name: 'portal-home',
          component: () => import('../../views/PortalView.vue'),
          meta: { navLabel: '工作概览' },
        },
        {
          path: '/workspace',
          name: 'workspace',
          component: () => import('../../views/WorkspaceView.vue'),
          meta: { navLabel: '业务工作区' },
        },
        {
          path: '/account/security',
          name: 'account-security',
          component: () => import('../../views/AccountSecurityView.vue'),
          meta: { navLabel: '账号安全' },
        },
        {
          // 不加权限守卫：无权限用户必须能进入并看到无权限页，而不是被重定向。
          path: '/platform/tenants',
          name: 'platform-tenants',
          component: () => import('../../features/tenants/views/TenantsView.vue'),
          meta: { navLabel: '租户管理' },
        },
      ],
    },
  ],
})

router.beforeEach(sessionGuard)

// 刷新被服务端拒绝时会话已清理，这里把用户送回登录页并保留当前路径供登录后回跳。
// 主动登出走 PortalLayout 自己的导航，不经过 expireSession，所以不会二次跳转。
onSessionExpired(() => {
  void router.replace({
    path: LOGIN_ROUTE,
    query: { redirect: router.currentRoute.value.fullPath },
  })
})

export default router
