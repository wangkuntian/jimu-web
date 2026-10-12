import type { NavigationGuard } from 'vue-router'

import { hasSession } from '../../shared/auth/session'

export const LOGIN_ROUTE = '/login'
export const DEFAULT_AUTHENTICATED_ROUTE = '/portal'

interface GuardTarget {
  path: string
  fullPath: string
  meta: { public?: boolean }
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
 * `RouteMeta` 是 `Record<string | number | symbol, unknown>`，不能直接传给要求
 * `{ public?: boolean }` 的 `GuardTarget`，因此适配时只挑出守卫关心的公开标记。
 */
export const sessionGuard: NavigationGuard = (to) =>
  resolveSessionNavigation({
    path: to.path,
    fullPath: to.fullPath,
    meta: { public: to.meta.public === true },
  })
