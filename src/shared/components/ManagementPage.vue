<script setup lang="ts">
type ManagementPageState = 'forbidden' | 'identity-error' | 'loading' | 'error' | 'empty' | 'table'

withDefaults(
  defineProps<{
    title: string
    description: string
    titleId: string
    testIdPrefix: string
    state: ManagementPageState
    forbiddenTitle: string
    forbiddenDescription: string
    errorMessage: string
    errorRequestId?: string
    emptyDescription: string
    total: number
    page: number
    pageSize: number
    loadingRows?: number
  }>(),
  {
    errorRequestId: '',
    loadingRows: 5,
  },
)

const emit = defineEmits<{
  'retry-identity': []
  'retry-list': []
  'filter-submit': []
  'update:page': [page: number]
}>()
</script>

<template>
  <section class="management-page" :aria-labelledby="titleId">
    <header class="management-heading">
      <div class="management-heading-copy">
        <p class="management-eyebrow">Platform</p>
        <h1 :id="titleId">{{ title }}</h1>
        <p class="management-lead">{{ description }}</p>
      </div>
    </header>

    <div v-if="state === 'forbidden'" class="management-state">
      <el-result
        :data-test="`${testIdPrefix}-forbidden`"
        icon="warning"
        :title="forbiddenTitle"
        :sub-title="forbiddenDescription"
      />
    </div>

    <div
      v-else-if="state === 'identity-error'"
      class="management-state"
      :data-test="`${testIdPrefix}-identity-error`"
    >
      <el-alert
        type="error"
        :closable="false"
        show-icon
        title="无法确认你的身份"
        description="后端暂时不可用，读不到当前账号的身份与权限。这不代表权限被移除，请稍后重试。"
      />
      <el-button
        class="management-retry"
        :data-test="`${testIdPrefix}-identity-retry`"
        @click="emit('retry-identity')"
      >
        重试
      </el-button>
    </div>

    <template v-else>
      <el-form
        v-if="$slots.filters"
        class="management-filters"
        :data-test="`${testIdPrefix}-filters`"
        inline
        @submit.prevent="emit('filter-submit')"
      >
        <slot name="filters" />
      </el-form>

      <div v-if="state === 'loading'" class="management-state">
        <el-skeleton :data-test="`${testIdPrefix}-loading`" :rows="loadingRows" animated />
      </div>

      <div
        v-else-if="state === 'error'"
        class="management-state"
        :data-test="`${testIdPrefix}-error`"
      >
        <el-alert type="error" :closable="false" show-icon :title="errorMessage" />
        <p v-if="errorRequestId" class="management-request-id">请求编号：{{ errorRequestId }}</p>
        <el-button
          class="management-retry"
          :data-test="`${testIdPrefix}-retry`"
          @click="emit('retry-list')"
        >
          重试
        </el-button>
      </div>

      <div
        v-else-if="state === 'empty'"
        class="management-state"
        :data-test="`${testIdPrefix}-empty`"
      >
        <el-empty :description="emptyDescription">
          <slot name="empty-action" />
        </el-empty>
      </div>

      <div v-else class="management-table-scroll" :data-test="`${testIdPrefix}-table`">
        <slot name="table" />
      </div>

      <el-pagination
        v-if="total > 0 && (state === 'table' || state === 'empty')"
        class="management-pagination"
        :data-test="`${testIdPrefix}-pagination`"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        background
        @update:current-page="emit('update:page', $event)"
      />
    </template>

    <slot name="dialogs" />
  </section>
</template>

<style scoped>
.management-page {
  min-width: 0;
}

.management-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.management-heading-copy {
  min-width: 0;
}

.management-eyebrow {
  margin: 0 0 8px;
  color: var(--jp-color-accent);
  font-size: var(--jp-font-size-caption);
  font-weight: var(--jp-font-weight-emphasis);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.management-heading h1 {
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.33;
}

.management-lead {
  margin: 8px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.management-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 16px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.management-filters :deep(.el-form-item) {
  margin: 0;
}

.management-filters :slotted(.management-filter-input) {
  width: 240px;
}

.management-filters :slotted(.management-filter-select) {
  width: 160px;
}

.management-filters :slotted(.management-filter-select--narrow) {
  width: 120px;
}

.management-filters :slotted(.management-filter-actions) {
  margin-left: auto;
}

.management-state {
  margin-top: 24px;
}

.management-retry {
  margin-top: 12px;
}

.management-table-scroll {
  margin-top: 16px;
  overflow-x: auto;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.management-pagination {
  margin-top: 16px;
}

.management-request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

@media (max-width: 640px) {
  .management-heading {
    align-items: flex-start;
  }

  .management-filters {
    align-items: stretch;
  }

  .management-filters :deep(.el-form-item),
  .management-filters :deep(.el-form-item__content) {
    width: 100%;
  }

  .management-filters :slotted(.management-filter-input),
  .management-filters :slotted(.management-filter-select),
  .management-filters :slotted(.management-filter-select--narrow) {
    width: 100%;
  }

  .management-filters :slotted(.management-filter-actions) {
    margin-left: 0;
  }
}
</style>
