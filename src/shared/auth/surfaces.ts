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
