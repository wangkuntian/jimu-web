<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/portal">Jimu Portal</RouterLink>
      <nav class="primary-nav" aria-label="主导航">
        <RouterLink to="/portal">平台工作区</RouterLink>
        <RouterLink to="/workspace">业务工作区</RouterLink>
        <RouterLink to="/account/security">账号安全</RouterLink>
      </nav>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
