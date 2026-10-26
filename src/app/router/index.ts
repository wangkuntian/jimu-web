import { createRouter, createWebHistory } from 'vue-router'

import { LOGIN_ROUTE, sessionGuard } from '../guards/session'
import { onSessionExpired } from '../../shared/auth/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/hub',
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
      path: '/hub',
      name: 'hub',
      component: () => import('../../features/hub/views/HubView.vue'),
    },
    {
      path: '/portal',
      redirect: '/hub',
    },
    {
      path: '/workspace',
      component: () => import('../../layouts/UserLayout.vue'),
      children: [
        {
          path: '',
          name: 'workspace',
          component: () => import('../../views/WorkspaceView.vue'),
          meta: { navLabel: '工作空间' },
        },
        {
          path: 'account/security',
          name: 'workspace-account-security',
          component: () => import('../../views/AccountSecurityView.vue'),
          meta: { navLabel: '账号安全' },
        },
      ],
    },
    {
      path: '/admin',
      component: () => import('../../layouts/PortalLayout.vue'),
      meta: { requiresAdmin: true },
      children: [
        {
          path: '',
          name: 'admin-home',
          component: () => import('../../views/PortalView.vue'),
          meta: { navLabel: '工作概览' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../../features/users/views/UsersView.vue'),
          meta: { navLabel: '用户管理' },
        },
        {
          path: 'roles',
          name: 'admin-roles',
          component: () => import('../../features/roles/views/RolesView.vue'),
          meta: { navLabel: '角色管理' },
        },
        {
          path: 'tenants',
          name: 'admin-tenants',
          component: () => import('../../features/tenants/views/TenantsView.vue'),
          meta: { navLabel: '租户管理' },
        },
        {
          path: 'account/security',
          name: 'admin-account-security',
          component: () => import('../../views/AccountSecurityView.vue'),
          meta: { navLabel: '账号安全' },
        },
      ],
    },
    {
      path: '/platform/tenants',
      redirect: '/admin/tenants',
    },
    {
      path: '/account/security',
      redirect: '/workspace/account/security',
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
