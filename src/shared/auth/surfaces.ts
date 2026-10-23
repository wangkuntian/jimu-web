import { apiResource } from '../api/config'
import { hasPermission } from './permission'

export type AppSurface = 'workspace' | 'admin'

const LAST_SURFACE_KEY = 'jimu.last_surface'

export function canAccessWorkspace(): true {
  return true
}

/** 管理控制台依赖资源读取能力；写入能力不能单独放行整个控制台。 */
export function canAccessAdminSurface(): boolean {
  return (
    hasPermission(apiResource('/users'), 'GET') || hasPermission(apiResource('/tenants'), 'GET')
  )
}

export function readLastSurface(): AppSurface | null {
  const stored = localStorage.getItem(LAST_SURFACE_KEY)
  return stored === 'workspace' || stored === 'admin' ? stored : null
}

export function rememberSurface(surface: AppSurface): void {
  localStorage.setItem(LAST_SURFACE_KEY, surface)
}

/** 深链接和账户菜单切换都算一次工作台使用，供下次进入 `/hub` 恢复。 */
export function rememberSurfaceForPath(path: string): void {
  if (path === '/admin' || path.startsWith('/admin/')) {
    rememberSurface('admin')
  } else if (path === '/workspace' || path.startsWith('/workspace/')) {
    rememberSurface('workspace')
  }
}
