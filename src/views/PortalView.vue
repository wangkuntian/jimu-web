<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowUpRight, Building2, LayoutGrid, ShieldCheck } from '@lucide/vue'

import { apiResource } from '../shared/api/config'
import { hasPermission } from '../shared/auth/permission'
import { getIdentity } from '../shared/auth/session'

const identity = computed(() => getIdentity())
const username = computed(() => identity.value?.user.username ?? '用户')
const roleLabel = computed(() => {
  const roles = identity.value?.roles ?? []
  return roles.length > 0 ? roles.join('、') : '暂未分配角色'
})
const permissionCount = computed(() => identity.value?.permissions.length ?? 0)
const canViewTenants = computed(() => hasPermission(apiResource('/tenants'), 'GET'))
</script>

<template>
  <section class="portal-page" aria-labelledby="portal-title">
    <header class="portal-heading">
      <div>
        <h1 id="portal-title">工作概览</h1>
        <p class="portal-lead">欢迎回来，{{ username }}。从这里继续你的工作。</p>
      </div>
    </header>

    <div class="portal-grid">
      <section class="workspace-feature" aria-labelledby="feature-title">
        <div>
          <p class="feature-kicker">统一工作入口</p>
          <h2 id="feature-title" class="feature-title">继续你的工作</h2>
          <p class="feature-description">平台管理、业务协作与账号安全共享同一身份边界。</p>
        </div>

        <div class="feature-actions">
          <RouterLink class="action-link primary-action" to="/workspace">
            进入业务工作区
            <ArrowRight :size="16" aria-hidden="true" />
          </RouterLink>
          <RouterLink
            v-if="canViewTenants"
            class="action-link secondary-action"
            data-test="portal-manage-tenants"
            to="/platform/tenants"
          >
            管理租户
            <ArrowUpRight :size="16" aria-hidden="true" />
          </RouterLink>
        </div>

        <dl class="feature-stats">
          <div>
            <dt>当前角色</dt>
            <dd data-test="portal-role">{{ roleLabel }}</dd>
          </div>
          <div>
            <dt>授权能力</dt>
            <dd>
              <span data-test="portal-permission-count">{{ permissionCount }}</span>
              项
            </dd>
          </div>
          <div>
            <dt>会话状态</dt>
            <dd>已登录</dd>
          </div>
        </dl>
      </section>

      <aside class="quick-panel" aria-labelledby="quick-title">
        <header class="quick-heading">
          <h2 id="quick-title">快捷入口</h2>
          <p>常用工作区与账号操作</p>
        </header>

        <nav class="quick-list" aria-label="快捷入口">
          <RouterLink class="quick-link" data-test="quick-workspace" to="/workspace">
            <span class="quick-icon">
              <LayoutGrid :size="18" aria-hidden="true" />
            </span>
            <span class="quick-copy">
              <strong>业务工作区</strong>
              <span>进入已启用的业务模块</span>
            </span>
            <ArrowUpRight class="quick-arrow" :size="16" aria-hidden="true" />
          </RouterLink>

          <RouterLink class="quick-link" data-test="quick-security" to="/account/security">
            <span class="quick-icon">
              <ShieldCheck :size="18" aria-hidden="true" />
            </span>
            <span class="quick-copy">
              <strong>账号安全</strong>
              <span>查看登录与设备安全设置</span>
            </span>
            <ArrowUpRight class="quick-arrow" :size="16" aria-hidden="true" />
          </RouterLink>

          <RouterLink
            v-if="canViewTenants"
            class="quick-link"
            data-test="quick-tenants"
            to="/platform/tenants"
          >
            <span class="quick-icon">
              <Building2 :size="18" aria-hidden="true" />
            </span>
            <span class="quick-copy">
              <strong>租户管理</strong>
              <span>管理租户状态与套餐归属</span>
            </span>
            <ArrowUpRight class="quick-arrow" :size="16" aria-hidden="true" />
          </RouterLink>
        </nav>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.portal-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
}

h1 {
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.33;
}

.portal-lead {
  margin: 8px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.portal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.75fr);
  gap: 16px;
  align-items: stretch;
}

.workspace-feature {
  display: flex;
  flex-direction: column;
  min-height: 420px;
  padding: 32px;
  color: var(--jp-color-surface);
  background: var(--jp-color-text);
  border: 1px solid var(--jp-color-text);
  border-top: 3px solid var(--jp-color-accent);
}

.feature-kicker {
  margin: 0;
  color: var(--jp-color-app-bg);
  font-size: var(--jp-font-size-caption);
  font-weight: var(--jp-font-weight-emphasis);
  letter-spacing: 0.08em;
}

.feature-title {
  max-width: 12em;
  margin: 16px 0 0;
  font-size: var(--jp-font-size-title);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.4;
}

.feature-description {
  max-width: 34em;
  margin: 12px 0 0;
  color: var(--jp-color-app-bg);
  font-size: var(--jp-font-size-body);
  line-height: 1.7;
}

.feature-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
  text-decoration: none;
  border-radius: var(--jp-radius-control);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.primary-action {
  color: var(--jp-color-surface);
  background: var(--jp-color-accent);
  border: 1px solid var(--jp-color-accent);
}

.primary-action:hover {
  background: var(--el-color-primary-dark-2);
  border-color: var(--el-color-primary-dark-2);
}

.secondary-action {
  color: var(--jp-color-surface);
  background: transparent;
  border: 1px solid var(--jp-color-text-muted);
}

.secondary-action:hover {
  background: var(--jp-color-text-muted);
}

.action-link:focus-visible {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: 2px;
}

.feature-stats {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.85fr) minmax(0, 0.85fr);
  gap: 24px;
  padding: 24px 0 0;
  margin: auto 0 0;
  border-top: 1px solid var(--jp-color-text-muted);
}

.feature-stats div {
  min-width: 0;
}

.feature-stats dt {
  color: var(--jp-color-app-bg);
  font-size: var(--jp-font-size-caption);
  line-height: 1.4;
}

.feature-stats dd {
  overflow: hidden;
  margin: 8px 0 0;
  color: var(--jp-color-surface);
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.5;
}

.quick-panel {
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
}

.quick-heading h2 {
  margin: 0;
  font-size: var(--jp-font-size-subtitle);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.5;
}

.quick-heading p {
  margin: 4px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.quick-list {
  margin-top: 16px;
}

.quick-link {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 16px;
  gap: 12px;
  align-items: center;
  min-height: 76px;
  padding: 16px 0;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--jp-color-hairline);
}

.quick-link:last-child {
  border-bottom: 0;
}

.quick-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--jp-color-accent);
  background: var(--jp-color-accent-subtle);
  border: 1px solid var(--jp-color-accent-border);
  border-radius: var(--jp-radius-control);
}

.quick-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.quick-copy strong {
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.5;
}

.quick-copy span {
  overflow: hidden;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-arrow {
  color: var(--el-text-color-secondary);
  transition: color 160ms ease;
}

.quick-link:hover strong,
.quick-link:hover .quick-arrow {
  color: var(--jp-color-accent);
}

.quick-link:focus-visible {
  outline: 2px solid var(--jp-color-accent);
  outline-offset: 2px;
}

@container app-main (max-width: 680px) {
  .portal-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-feature {
    min-height: 380px;
  }
}

@container app-main (max-width: 640px) {
  .portal-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  .workspace-feature {
    min-height: auto;
    padding: 24px;
  }

  .feature-stats {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .feature-stats dd {
    white-space: normal;
  }

  .action-link {
    min-height: 44px;
  }

  .quick-panel {
    padding: 20px;
  }
}

@container app-main (max-width: 480px) {
  .feature-actions {
    flex-direction: column;
  }

  .action-link {
    width: 100%;
  }
}
</style>
