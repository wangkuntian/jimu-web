<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

defineProps<{
  label: string
  hasMore: boolean
}>()
</script>

<template>
  <div class="management-row-actions">
    <slot />
    <el-dropdown v-if="hasMore" trigger="click" placement="bottom-end">
      <el-button text :aria-label="`${label}的更多操作`">
        更多
        <el-icon class="management-more-icon" aria-hidden="true"><ChevronDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu class="management-action-menu">
          <slot name="more" />
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.management-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.management-row-actions :deep(.el-button) {
  padding: 8px;
  margin: 0;
}

.management-more-icon {
  margin-left: 4px;
}

/* The dropdown is teleported outside the table's clipping and scoped styles. */
:global(.management-action-menu .el-dropdown-menu__item) {
  min-width: 128px;
  gap: 8px;
  padding: 8px 16px;
  font-size: var(--jp-font-size-body);
}

:global(.management-action-menu .management-action-danger) {
  color: var(--el-color-danger);
}

@media (max-width: 640px) {
  .management-row-actions :deep(.el-button),
  :global(.management-action-menu .el-dropdown-menu__item) {
    min-height: 44px;
  }
}
</style>
