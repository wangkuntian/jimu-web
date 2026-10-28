<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'

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
      <div
        v-if="$slots.actions && state !== 'forbidden' && state !== 'identity-error'"
        class="management-heading-actions"
      >
        <slot name="actions" />
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
        label-position="top"
        :aria-label="`${title}筛选`"
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

      <footer
        v-if="total > 0 && (state === 'table' || state === 'empty')"
        class="management-footer"
      >
        <el-config-provider :locale="zhCn">
          <el-pagination
            class="management-pagination"
            :data-test="`${testIdPrefix}-pagination`"
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            :pager-count="5"
            :aria-label="`${title}分页`"
            layout="total, prev, pager, next"
            background
            @update:current-page="emit('update:page', $event)"
          />
        </el-config-provider>
      </footer>
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

.management-heading-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
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
  gap: 16px;
  align-items: flex-end;
  padding: 16px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}

.management-filters :deep(.el-form-item) {
  flex: 1 1 144px;
  min-width: 0;
  margin: 0;
}

.management-filters :deep(.el-form-item__label) {
  height: auto;
  margin-bottom: 8px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  line-height: 1.5;
}

.management-filters :deep(.management-filter-keyword) {
  flex: 2 1 220px;
}

.management-filters :deep(.management-filter-input),
.management-filters :deep(.management-filter-select) {
  width: 100%;
}

.management-filters :deep(.management-filter-actions) {
  flex: 0 0 auto;
  margin-left: auto;
}

.management-filters :deep(.management-filter-actions .el-form-item__content) {
  gap: 8px;
}

.management-filters :deep(.management-filter-actions .el-button + .el-button) {
  margin-left: 0;
}

.management-filters :deep(.management-filter-error) {
  flex-basis: 100%;
  order: 1;
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

.management-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}

.management-pagination {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.management-pagination :deep(.el-pagination__total) {
  margin-right: 8px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

.management-pagination :deep(.btn-prev),
.management-pagination :deep(.btn-next),
.management-pagination :deep(.el-pager li) {
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
  background: var(--jp-color-surface);
}

.management-pagination :deep(.el-pager li.is-active) {
  border-color: var(--jp-color-accent);
  background: var(--jp-color-accent);
}

.management-request-id {
  margin: 12px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
}

@media (max-width: 640px) {
  .management-heading {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 16px;
  }

  .management-filters {
    align-items: stretch;
  }

  .management-filters :deep(.el-form-item),
  .management-filters :deep(.el-form-item__content) {
    width: 100%;
  }

  .management-filters :deep(.el-form-item) {
    flex-basis: 100%;
  }

  .management-filters :deep(.management-filter-actions) {
    align-items: stretch;
    flex: 1 1 100%;
    margin-left: 0;
  }

  .management-filters :deep(.management-filter-actions .el-form-item__content) {
    margin-left: 0 !important;
  }

  .management-filters :deep(.management-filter-actions .el-button) {
    width: 100%;
  }

  .management-pagination {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    width: 100%;
  }

  .management-pagination :deep(.el-pagination__total) {
    grid-column: 1 / -1;
    justify-self: end;
    margin: 0;
  }

  .management-pagination :deep(.btn-prev),
  .management-pagination :deep(.btn-next),
  .management-pagination :deep(.el-pager) {
    margin: 0;
  }

  .management-pagination :deep(.el-pager) {
    justify-content: center;
  }

  .management-pagination :deep(.el-pager li:not(.is-active)) {
    display: none;
  }

  .management-pagination :deep(.el-pager li) {
    flex-shrink: 0;
    margin: 0;
  }

  .management-filters :deep(.el-input__wrapper),
  .management-filters :deep(.el-select__wrapper),
  .management-page :deep(.el-button),
  .management-pagination :deep(.btn-prev),
  .management-pagination :deep(.btn-next),
  .management-pagination :deep(.el-pager li) {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
