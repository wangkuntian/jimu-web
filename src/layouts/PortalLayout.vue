<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { LOGIN_ROUTE } from '../app/guards/session'
import { logout } from '../features/auth/api'
import { apiResource } from '../shared/api/config'
import { hasPermission } from '../shared/auth/permission'

const router = useRouter()

// 导航项按权限隐藏；无权限时入口不出现，但路由本身仍可直达（页面会渲染无权限态）。
const canViewTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))

async function onLogout(): Promise<void> {
  try {
    await logout()
  } finally {
    await router.push(LOGIN_ROUTE)
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/portal">Jimu Portal</RouterLink>
      <nav class="primary-nav" aria-label="主导航">
        <RouterLink to="/portal">平台工作区</RouterLink>
        <RouterLink to="/workspace">业务工作区</RouterLink>
        <RouterLink to="/account/security">账号安全</RouterLink>
        <RouterLink v-if="canViewTenants" to="/platform/tenants">租户管理</RouterLink>
      </nav>
      <el-button text @click="onLogout">退出登录</el-button>
    </header>

    <main class="app-main">
      <slot>
        <RouterView />
      </slot>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 2rem;
  min-height: 64px;
  padding: 0 32px;
  background: var(--jp-color-surface);
  border-bottom: 1px solid var(--jp-color-hairline);
}

.brand {
  color: var(--jp-color-accent);
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
  text-decoration: none;
}

.primary-nav {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 1.25rem;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
}

.primary-nav a {
  text-decoration: none;
}

.primary-nav a.router-link-active,
.primary-nav a:hover {
  color: var(--jp-color-accent);
}

.app-main {
  width: min(100% - 48px, 1120px);
  margin: 0 auto;
  padding: 72px 0;
}

@media (max-width: 640px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 16px 24px;
  }

  .app-main {
    width: min(100% - 32px, 1120px);
    padding: 48px 0;
  }
}
</style>
