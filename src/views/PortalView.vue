<script setup lang="ts">
import { computed } from 'vue'

import { apiResource } from '../shared/api/config'
import { hasPermission } from '../shared/auth/permission'

const canViewTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
</script>

<template>
  <section class="page-section" aria-labelledby="portal-title">
    <p class="eyebrow">Platform</p>
    <h1 id="portal-title">平台工作区</h1>
    <p class="page-lead">
      平台工作区已接入真实后端：会话身份与权限由 /auth/me 下发，租户与套餐数据以服务端返回为准。
    </p>

    <div class="workspace-links">
      <RouterLink v-if="canViewTenants" class="workspace-link" to="/platform/tenants">
        管理租户
      </RouterLink>
      <RouterLink class="workspace-link" to="/workspace">进入业务工作区</RouterLink>
      <RouterLink class="workspace-link" to="/account/security">查看账号安全</RouterLink>
    </div>
  </section>
</template>
