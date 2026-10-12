import { createRouter, createWebHistory } from 'vue-router'

import { sessionGuard } from '../guards/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../../features/auth/views/LoginView.vue'),
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
