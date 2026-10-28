<script setup lang="ts">
import jimuMark from '../assets/jimu-mark.svg'

interface AuthLayoutProps {
  panelTitle: string
  panelDescription: string
}

defineProps<AuthLayoutProps>()
</script>

<template>
  <div class="auth-shell">
    <header class="auth-masthead">
      <div class="brand-lockup" aria-label="Jimu Hub">
        <img :src="jimuMark" class="brand-mark" alt="" aria-hidden="true" />
        <span class="brand-name">Jimu Hub</span>
      </div>
    </header>

    <main class="auth-workspace">
      <section class="auth-context" aria-labelledby="auth-context-title">
        <div class="auth-context-copy">
          <span class="auth-context-rule" aria-hidden="true"></span>
          <p id="auth-context-title" class="auth-context-title">让访问更清晰，让工作更专注。</p>
        </div>
      </section>

      <section class="auth-panel" aria-labelledby="auth-panel-title">
        <div class="auth-content">
          <h1 id="auth-panel-title" class="auth-panel-title">{{ panelTitle }}</h1>
          <p class="auth-panel-description">{{ panelDescription }}</p>

          <slot />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  background: var(--jp-color-app-bg);
  color: var(--jp-color-text);
}

.auth-masthead {
  display: flex;
  align-items: center;
  width: min(100%, 1180px);
  min-height: 72px;
  margin: 0 auto;
  padding: 0 24px;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: block;
  width: 28px;
  height: 28px;
}

.brand-name {
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-title);
  font-weight: var(--jp-font-weight-emphasis);
  letter-spacing: -0.02em;
  line-height: 1;
}

.auth-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 0.82fr) minmax(420px, 1.18fr);
  width: min(calc(100% - 48px), 1180px);
  min-height: calc(100vh - 96px);
  margin: 0 auto;
  padding-bottom: 24px;
}

.auth-context {
  display: flex;
  align-items: center;
  min-height: 640px;
  padding: 48px;
  color: var(--jp-color-surface);
  background: var(--jp-color-text);
  border: 1px solid var(--jp-color-text);
}

.auth-context-copy {
  width: min(100%, 20rem);
}

.auth-context-rule {
  display: block;
  width: 32px;
  height: 2px;
  margin-bottom: 24px;
  background: var(--el-color-primary-light-3);
}

.auth-context-title {
  max-width: 10em;
  margin: 0;
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.45;
  text-wrap: balance;
}

.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 640px;
  padding: 48px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-left: 0;
}

.auth-content {
  width: min(100%, 380px);
}

.auth-panel-title {
  margin: 0;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-display);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.33;
}

.auth-panel-description {
  margin: 8px 0 0;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-body);
  line-height: 1.5;
}

.auth-content :deep(.auth-alert-stack) {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.auth-content :deep(.auth-form) {
  margin-top: 24px;
}

.auth-content :deep(.auth-form .el-form-item) {
  margin-bottom: 20px;
}

.auth-content :deep(.auth-form .el-form-item__label) {
  height: auto;
  margin-bottom: 6px;
  color: var(--jp-color-text);
  font-size: var(--jp-font-size-body);
  font-weight: var(--jp-font-weight-emphasis);
  line-height: 1.5;
}

.auth-content :deep(.auth-form .el-input__wrapper) {
  min-height: 40px;
  outline: 2px solid transparent;
  outline-offset: 1px;
  box-shadow: 0 0 0 1px var(--jp-color-hairline) inset;
}

.auth-content :deep(.auth-form .el-input__wrapper.is-focus) {
  outline-color: var(--jp-color-accent);
  box-shadow: 0 0 0 1px var(--jp-color-accent) inset;
}

.auth-content :deep(.auth-field-help) {
  display: block;
  margin-top: 4px;
  color: var(--jp-color-text-muted);
  font-size: var(--jp-font-size-caption);
  line-height: 1.5;
}

.auth-content :deep(.auth-options) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 24px;
}

.auth-content :deep(.auth-options .el-checkbox) {
  min-height: 40px;
}

.auth-content :deep(.auth-link) {
  color: var(--jp-color-accent);
  font-size: var(--jp-font-size-body);
}

.auth-content :deep(.auth-link:focus-visible) {
  outline: 2px solid var(--jp-color-accent);
  outline-offset: 2px;
}

.auth-content :deep(.auth-captcha-row) {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.auth-content :deep(.auth-captcha-row .el-input) {
  min-width: 0;
  flex: 1;
}

.auth-content :deep(.auth-captcha-image) {
  flex: 0 0 120px;
  width: 120px;
  height: 40px;
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
  object-fit: contain;
}

.auth-content :deep(.auth-submit) {
  width: 100%;
  min-height: 40px;
}

@media (hover: hover) {
  .auth-content :deep(.auth-form .el-input__wrapper:hover:not(.is-focus)) {
    box-shadow: 0 0 0 1px var(--jp-color-text-muted) inset;
  }
}

.auth-context,
.auth-panel {
  animation: auth-reveal 180ms ease-out both;
}

.auth-panel {
  animation-delay: 40ms;
}

@keyframes auth-reveal {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 760px) {
  .auth-shell {
    min-height: 100dvh;
  }

  .auth-masthead {
    min-height: 64px;
    padding: 0 16px;
  }

  .auth-workspace {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    min-height: auto;
    padding: 0 16px 16px;
  }

  .auth-context {
    min-height: auto;
    padding: 32px 24px;
  }

  .auth-context-copy {
    width: 100%;
  }

  .auth-context-title {
    max-width: 12em;
    font-size: var(--jp-font-size-title);
  }

  .auth-panel {
    min-height: auto;
    padding: 32px 24px;
    border-top: 0;
    border-left: 1px solid var(--jp-color-hairline);
  }

  .auth-content :deep(.auth-form .el-input__wrapper),
  .auth-content :deep(.auth-options .el-checkbox),
  .auth-content :deep(.auth-submit) {
    min-height: 44px;
  }
}

@media (max-width: 540px) {
  .auth-panel {
    padding: 28px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-context,
  .auth-panel {
    animation: none;
  }
}
</style>
