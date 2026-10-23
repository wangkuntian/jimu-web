<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Building2, House, LayoutGrid, LogOut, PanelLeft, ShieldCheck } from '@lucide/vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { LOGIN_ROUTE } from '../app/guards/session'
import jimuMark from '../assets/jimu-mark.svg'
import { logout } from '../features/auth/api'
import { apiResource } from '../shared/api/config'
import { hasPermission } from '../shared/auth/permission'
import { getIdentity } from '../shared/auth/session'

const route = useRoute()
const router = useRouter()

const compactMedia =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 1023px)')
    : null
const mobileMedia =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)')
    : null
const sidebarCollapsed = ref(compactMedia?.matches ?? false)
const isMobileViewport = ref(mobileMedia?.matches ?? false)
const menuMode = computed<'vertical' | 'horizontal'>(() =>
  isMobileViewport.value ? 'horizontal' : 'vertical',
)
const menuCollapsed = computed(() => !isMobileViewport.value && sidebarCollapsed.value)

const identity = computed(() => getIdentity())
const username = computed(() => identity.value?.user.username ?? '用户')
const primaryRole = computed(() => identity.value?.roles[0] ?? '未分配角色')
const initials = computed(() => Array.from(username.value).slice(0, 1).join('').toUpperCase())
const currentPageLabel = computed(() =>
  typeof route.meta.navLabel === 'string' ? route.meta.navLabel : '工作空间',
)

// 导航项按权限隐藏；无权限时入口不出现，但路由本身仍可直达（页面会渲染无权限态）。
const canViewTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
const navigationItems = computed(() => [
  { index: '/portal', label: '工作概览', icon: House },
  { index: '/workspace', label: '业务工作区', icon: LayoutGrid },
  { index: '/account/security', label: '账号安全', icon: ShieldCheck },
  ...(canViewTenants.value
    ? [{ index: '/platform/tenants', label: '租户管理', icon: Building2 }]
    : []),
])

function onViewportChange(event: MediaQueryListEvent): void {
  isMobileViewport.value = event.matches
}

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

onMounted(() => {
  mobileMedia?.addEventListener('change', onViewportChange)
})

onBeforeUnmount(() => {
  mobileMedia?.removeEventListener('change', onViewportChange)
})

async function onLogout(): Promise<void> {
  try {
    await logout()
  } finally {
    await router.push(LOGIN_ROUTE)
  }
}

async function onAccountCommand(command: string): Promise<void> {
  if (command === 'logout') {
    await onLogout()
    return
  }

  if (command === 'home') {
    await router.push('/portal')
  } else if (command === 'workspace') {
    await router.push('/workspace')
  } else if (command === 'security') {
    await router.push('/account/security')
  }
}
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>

  <el-container class="app-shell" :class="{ 'is-sidebar-collapsed': sidebarCollapsed }">
    <el-aside id="primary-sidebar" class="app-sidebar">
      <RouterLink class="brand" aria-label="Jimu Hub 工作概览" to="/portal">
        <img :src="jimuMark" class="brand-mark" alt="" aria-hidden="true" />
        <span class="brand-text">Jimu Hub</span>
      </RouterLink>

      <el-scrollbar class="sidebar-scroll">
        <el-menu
          class="sidebar-menu"
          :default-active="route.path"
          :mode="menuMode"
          :collapse="menuCollapsed"
          :ellipsis="false"
          :router="true"
        >
          <el-menu-item
            v-for="item in navigationItems"
            :key="item.index"
            :index="item.index"
            :aria-label="item.label"
          >
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>

      <div class="sidebar-account" :title="`${username} · ${primaryRole}`">
        <el-dropdown trigger="click" placement="top-end" @command="onAccountCommand">
          <el-button
            class="account-trigger"
            text
            :aria-label="'打开账户菜单'"
            :title="`${username} · ${primaryRole}`"
          >
            <el-avatar class="account-avatar" :size="36" aria-hidden="true">
              {{ initials }}
            </el-avatar>
          </el-button>

          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="home">
                <span class="account-menu-label">
                  <House :size="16" aria-hidden="true" />
                  工作概览
                </span>
              </el-dropdown-item>
              <el-dropdown-item command="workspace">
                <span class="account-menu-label">
                  <LayoutGrid :size="16" aria-hidden="true" />
                  业务工作区
                </span>
              </el-dropdown-item>
              <el-dropdown-item command="security">
                <span class="account-menu-label">
                  <ShieldCheck :size="16" aria-hidden="true" />
                  账号安全
                </span>
              </el-dropdown-item>
              <el-dropdown-item command="logout" divided>
                <span class="account-menu-label">
                  <LogOut :size="16" aria-hidden="true" />
                  退出登录
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <span class="account-copy">
          <strong>{{ username }}</strong>
          <span>{{ primaryRole }}</span>
        </span>
      </div>
    </el-aside>

    <el-container class="app-frame" direction="vertical">
      <el-header class="app-topbar">
        <el-button
          class="sidebar-toggle"
          text
          :aria-label="sidebarCollapsed ? '展开导航' : '收起导航'"
          :aria-expanded="!sidebarCollapsed"
          aria-controls="primary-sidebar"
          @click="toggleSidebar"
        >
          <el-icon>
            <PanelLeft />
          </el-icon>
        </el-button>

        <p class="topbar-context">
          <strong v-if="sidebarCollapsed" class="topbar-brand">Jimu Hub</strong>
          <strong class="topbar-current">{{ currentPageLabel }}</strong>
        </p>
      </el-header>

      <el-main id="main-content" class="app-main" tabindex="-1">
        <slot>
          <RouterView />
        </slot>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--jp-color-app-bg);
}

.skip-link {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 100;
  padding: 8px 12px;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-body);
  text-decoration: none;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-accent);
  border-radius: var(--jp-radius-control);
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--jp-color-accent);
  outline-offset: 2px;
}

.app-sidebar {
  --el-aside-width: 232px;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--jp-color-surface);
  border-right: 1px solid var(--jp-color-hairline);
}

.app-shell.is-sidebar-collapsed .app-sidebar {
  --el-aside-width: 72px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 0 20px;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
  text-decoration: none;
  border-bottom: 1px solid var(--jp-color-hairline);
}

.brand:focus-visible {
  outline: 2px solid var(--jp-color-accent);
  outline-offset: -2px;
}

.brand-mark {
  display: block;
  flex: none;
  width: 28px;
  height: 28px;
}

.brand-text {
  line-height: 1;
}

.sidebar-scroll {
  flex: 1;
}

.sidebar-menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--jp-color-text-muted);
  --el-menu-hover-text-color: var(--jp-color-text);
  --el-menu-hover-bg-color: var(--jp-color-app-bg);
  --el-menu-active-color: var(--jp-color-accent);
  --el-menu-item-height: 40px;
  --el-menu-item-font-size: var(--jp-font-size-body);
  --el-menu-base-level-padding: 10px;
  --el-menu-level-padding: 10px;
  --el-menu-icon-width: 20px;
  --el-menu-border-color: transparent;
  font-size: var(--jp-font-size-body);
  border-right: 0;
}

.sidebar-menu.el-menu--collapse {
  width: 100%;
}

.sidebar-menu :deep(.el-menu-item) {
  min-height: 40px;
  margin-bottom: 4px;
  border-radius: var(--jp-radius-control);
}

.sidebar-menu :deep(.el-menu-item .el-icon) {
  margin-right: 10px;
  font-size: 18px;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  position: relative;
  font-weight: var(--jp-font-weight-emphasis);
  background: var(--jp-color-accent-subtle);
}

.sidebar-menu :deep(.el-menu-item.is-active)::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  content: '';
  background: var(--jp-color-accent);
}

.app-shell.is-sidebar-collapsed .brand {
  justify-content: center;
  padding: 0;
}

.app-shell.is-sidebar-collapsed .brand-text,
.app-shell.is-sidebar-collapsed .account-copy {
  display: none;
}

.app-shell.is-sidebar-collapsed .sidebar-menu :deep(.el-menu-item) {
  justify-content: center;
  padding: 0 !important;
}

.app-shell.is-sidebar-collapsed .sidebar-menu :deep(.el-menu-item .el-icon) {
  margin-right: 0;
}

/* ElMenu centers the collapsed item, but its absolute tooltip trigger keeps horizontal padding. */
.app-shell.is-sidebar-collapsed .sidebar-menu :deep(.el-menu-item .el-menu-tooltip__trigger) {
  justify-content: center;
  padding: 0;
}

.sidebar-account {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 16px 20px;
  border-top: 1px solid var(--jp-color-hairline);
}

.app-shell.is-sidebar-collapsed .sidebar-account {
  flex-direction: column;
  justify-content: center;
  padding: 16px 8px;
}

.account-trigger {
  width: 44px;
  min-height: 44px;
  padding: 0;
}

.account-trigger :deep(> span) {
  display: grid;
  place-items: center;
}

.account-avatar {
  --el-avatar-bg-color: var(--jp-color-text);
  --el-avatar-text-color: var(--jp-color-surface);
  font-size: var(--jp-font-size-caption);
  font-weight: var(--jp-font-weight-emphasis);
  border-radius: var(--jp-radius-control);
}

.account-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.account-copy strong,
.account-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy strong {
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
}

.account-copy span {
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.account-menu-label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.app-frame {
  min-width: 0;
  min-height: 100vh;
}

.app-topbar {
  --el-header-height: 64px;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 32px;
  background: var(--jp-color-surface);
  border-bottom: 1px solid var(--jp-color-hairline);
}

.topbar-context {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.topbar-brand {
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
}

.topbar-brand::after {
  margin: 0 8px;
  color: var(--jp-color-text-muted);
  content: '/';
}

.topbar-current {
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
}

.sidebar-toggle {
  width: 44px;
  min-height: 44px;
  padding: 0;
}

.app-main {
  flex: 1;
  width: min(calc(100% - 64px), 1120px);
  padding: 40px 0 48px;
  margin: 0 auto;
  container-name: app-main;
  container-type: inline-size;
}

.app-main:focus-visible {
  outline: 2px solid var(--jp-color-accent);
  outline-offset: -2px;
}

@media (max-width: 1023px) {
  .app-topbar {
    padding: 0 24px;
  }

  .app-main {
    width: min(calc(100% - 48px), 1120px);
    padding-top: 32px;
  }
}

@media (max-width: 640px) {
  .app-shell {
    flex-direction: column;
  }

  .app-sidebar,
  .app-shell.is-sidebar-collapsed .app-sidebar {
    --el-aside-width: 100%;
    position: relative;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--jp-color-hairline);
  }

  .brand,
  .app-shell.is-sidebar-collapsed .brand {
    justify-content: flex-start;
    min-height: 64px;
    padding: 0 16px;
    border-bottom: 0;
  }

  .brand-text,
  .app-shell.is-sidebar-collapsed .brand-text {
    display: inline;
  }

  .sidebar-scroll {
    flex: none;
  }

  .sidebar-scroll :deep(.el-scrollbar__wrap) {
    overflow-x: auto;
  }

  .sidebar-menu.el-menu--horizontal {
    width: max-content;
    min-width: 100%;
    height: 44px;
    border-bottom: 0;
  }

  .sidebar-menu.el-menu--horizontal :deep(.el-menu-item) {
    height: 44px;
    min-height: 44px;
    margin: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
  }

  .app-shell.is-sidebar-collapsed .sidebar-menu.el-menu--horizontal :deep(.el-menu-item) {
    justify-content: flex-start;
    padding: 0 10px !important;
  }

  .app-shell.is-sidebar-collapsed .sidebar-menu.el-menu--horizontal :deep(.el-menu-item .el-icon) {
    margin-right: 10px;
  }

  .sidebar-menu.el-menu--horizontal :deep(.el-menu-item.is-active) {
    background: transparent;
    border-bottom-color: var(--jp-color-accent);
  }

  .sidebar-menu.el-menu--horizontal :deep(.el-menu-item.is-active)::before {
    display: none;
  }

  .sidebar-account,
  .app-shell.is-sidebar-collapsed .sidebar-account {
    flex-direction: row;
    justify-content: flex-start;
    padding: 12px 16px;
  }

  .account-copy,
  .app-shell.is-sidebar-collapsed .account-copy {
    display: grid;
  }

  .topbar-brand,
  .sidebar-toggle {
    display: none;
  }

  .app-topbar {
    --el-header-height: 56px;
    padding: 0 16px;
  }

  .app-main {
    width: min(calc(100% - 32px), 1120px);
    padding: 24px 0 32px;
  }
}
</style>
