import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal',
    },
    {
      path: '/portal',
      name: 'portal',
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
})

export default router
