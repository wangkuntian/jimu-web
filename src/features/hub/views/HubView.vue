<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Building2, LayoutGrid } from '@lucide/vue'
import { useRouter } from 'vue-router'

import jimuMark from '../../../assets/jimu-mark.svg'
import {
  canAccessAdminSurface,
  readLastSurface,
  rememberSurface,
} from '../../../shared/auth/surfaces'
import type { AppSurface } from '../../../shared/auth/surfaces'
import { ensureIdentity, getIdentityStatus } from '../../../shared/auth/identity'

const router = useRouter()
const canUseAdmin = computed(() => canAccessAdminSurface())
const identityStatus = computed(() => getIdentityStatus())

const surfaceRoutes: Record<AppSurface, string> = {
  workspace: '/workspace',
  admin: '/admin',
}

onMounted(async () => {
  if (identityStatus.value === 'unavailable') {
    return
  }
  if (!canUseAdmin.value) {
    await router.replace(surfaceRoutes.workspace)
    return
  }

  const lastSurface = readLastSurface()
  if (lastSurface !== null) {
    await router.replace(surfaceRoutes[lastSurface])
  }
})

async function enterSurface(surface: AppSurface): Promise<void> {
  rememberSurface(surface)
  await router.push(surfaceRoutes[surface])
}

async function retryIdentity(): Promise<void> {
  const status = await ensureIdentity()
  if (status !== 'ok') {
    return
  }

  const lastSurface = readLastSurface()
  if (lastSurface !== null) {
    await router.replace(surfaceRoutes[lastSurface])
  } else if (!canAccessAdminSurface()) {
    await router.replace(surfaceRoutes.workspace)
  }
}
</script>

<template>
  <main class="hub-page">
    <header class="hub-heading">
      <div class="hub-brand">
        <img :src="jimuMark" class="hub-mark" alt="" aria-hidden="true" />
        <span>Jimu Hub</span>
      </div>
      <h1>选择工作台</h1>
      <p>使用同一账号进入日常业务或平台管理空间。</p>
    </header>

    <el-alert
      v-if="identityStatus === 'unavailable'"
      class="hub-identity-error"
      data-test="hub-identity-error"
      type="error"
      :closable="false"
      show-icon
      title="无法确认你的身份"
      description="后端暂时不可用，读不到当前账号的权限。请稍后重试，这不会清除你的登录状态。"
    >
      <template #default>
        <el-button class="hub-retry" @click="retryIdentity">重试</el-button>
      </template>
    </el-alert>

    <div class="hub-options">
      <el-card class="hub-card" shadow="never">
        <div class="hub-card-heading">
          <span class="hub-card-icon">
            <LayoutGrid :size="22" aria-hidden="true" />
          </span>
          <div>
            <p class="hub-card-kicker">Workspace</p>
            <h2>用户工作区</h2>
          </div>
        </div>
        <p class="hub-card-description">进入日常业务、协作空间与个人账号设置。</p>
        <el-button
          data-test="hub-workspace"
          class="hub-card-action"
          @click="enterSurface('workspace')"
        >
          进入用户工作区
        </el-button>
      </el-card>

      <el-card v-if="canUseAdmin" class="hub-card hub-card-admin" shadow="never">
        <div class="hub-card-heading">
          <span class="hub-card-icon">
            <Building2 :size="22" aria-hidden="true" />
          </span>
          <div>
            <p class="hub-card-kicker">Administration</p>
            <h2>管理控制台</h2>
          </div>
        </div>
        <p class="hub-card-description">管理平台用户、租户与组织访问范围。</p>
        <el-button data-test="hub-admin" class="hub-card-action" @click="enterSurface('admin')">
          进入管理控制台
        </el-button>
      </el-card>
    </div>
  </main>
</template>

<style scoped>
.hub-page {
  display: grid;
  place-content: center;
  min-height: 100vh;
  padding: 48px 24px;
  background: var(--jp-color-app-bg);
}

.hub-heading {
  max-width: 680px;
  margin: 0 auto 32px;
  text-align: center;
}

.hub-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
}

.hub-mark {
  width: 28px;
  height: 28px;
}

.hub-heading h1 {
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.33;
}

.hub-heading p {
  margin: 8px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.hub-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 320px));
  gap: 16px;
  max-width: 680px;
  margin: 0 auto;
}

.hub-identity-error {
  max-width: 680px;
  margin: 0 auto 16px;
}

.hub-retry {
  margin-top: 8px;
}

.hub-card {
  border-color: var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.hub-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  padding: 24px;
}

.hub-card-admin {
  border-top: 3px solid var(--jp-color-accent);
}

.hub-card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hub-card-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--jp-color-accent);
  background: var(--jp-color-accent-subtle);
  border: 1px solid var(--jp-color-accent-border);
  border-radius: var(--jp-radius-control);
}

.hub-card-kicker {
  margin: 0 0 4px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  line-height: 1.33;
}

.hub-card h2 {
  margin: 0;
  font-size: var(--jp-font-size-title);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.4;
}

.hub-card-description {
  margin: 20px 0 24px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.6;
}

.hub-card-action {
  width: 100%;
  min-height: 40px;
  margin-top: auto;
}

@media (max-width: 640px) {
  .hub-page {
    place-content: start center;
    padding: 40px 16px;
  }

  .hub-options {
    grid-template-columns: 1fr;
  }
}
</style>
