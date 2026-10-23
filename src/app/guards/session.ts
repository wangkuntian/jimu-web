import type { NavigationGuard } from 'vue-router'

import { ensureIdentity } from '../../shared/auth/identity'
import { clearSession, hasSession } from '../../shared/auth/session'
import { canAccessAdminSurface } from '../../shared/auth/surfaces'

export const LOGIN_ROUTE = '/login'
export const DEFAULT_AUTHENTICATED_ROUTE = '/hub'

interface GuardTarget {
  path: string
  fullPath: string
  meta: { public?: boolean; requiresAdmin?: boolean }
}

export type SessionNavigation = true | { path: string; query?: Record<string, string> }

/**
 * 会话导航判定。抽成纯函数以便直接测试，不依赖 router 实例。
 *
 * 登录状态只代表「存在 refresh token」，不代表访问令牌仍然有效；
 * 访问令牌是否可用由 API 层的刷新与重试负责。
 */
export function resolveSessionNavigation(to: GuardTarget): SessionNavigation {
  const authenticated = hasSession()

  if (authenticated && to.path === LOGIN_ROUTE) {
    return { path: DEFAULT_AUTHENTICATED_ROUTE }
  }

  if (!authenticated && to.meta.public !== true) {
    return { path: LOGIN_ROUTE, query: { redirect: to.fullPath } }
  }

  return true
}

/**
 * 会话引导 + 导航判定。
 *
 * 冷启动（sessionStorage 里有 refresh token）与登录后都走这里：受保护路由先取身份，
 * 页面渲染时 hasPermission 就已经有数据。失败不拦：'unavailable' 只是后端抖动。
 */
export async function resolveGuardNavigation(to: GuardTarget): Promise<SessionNavigation> {
  let identityStatus: Awaited<ReturnType<typeof ensureIdentity>> | null = null

  if (hasSession()) {
    identityStatus = await ensureIdentity()
    if (identityStatus === 'unauthenticated') {
      // 守卫自己会导航，所以用 clearSession 而不是 expireSession，避免订阅二次跳转。
      clearSession()
    }
  }

  const navigation = resolveSessionNavigation(to)
  if (navigation !== true) {
    return navigation
  }

  // 身份不可用时不据此收权：管理页会渲染身份错误态，恢复后仍可重试。
  if (identityStatus === 'ok' && to.meta.requiresAdmin === true && !canAccessAdminSurface()) {
    return { path: '/workspace' }
  }

  return true
}

/**
 * `RouteMeta` 是 `Record<string | number | symbol, unknown>`，不能直接传给要求
 * `{ public?: boolean }` 的 `GuardTarget`，因此适配时只挑出守卫关心的公开标记。
 */
export const sessionGuard: NavigationGuard = (to) =>
  resolveGuardNavigation({
    path: to.path,
    fullPath: to.fullPath,
    meta: {
      public: to.meta.public === true,
      requiresAdmin: to.meta.requiresAdmin === true,
    },
  })
