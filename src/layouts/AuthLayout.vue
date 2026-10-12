<template>
  <div class="auth-layout">
    <main class="auth-card">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--jp-color-app-bg);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--jp-color-surface);
  border: 1px solid var(--jp-color-hairline);
  border-radius: var(--jp-radius-control);
}
</style>
