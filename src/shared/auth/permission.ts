import { getIdentity } from './session'

/**
 * Casbin v3 `util.KeyMatch` 的前端等价实现。
 *
 * 后端 matcher 是 `keyMatch(r.obj, p.obj) && (r.act == p.act || p.act == "*")`，
 * 即 `keyMatch(请求路径, 已授权 resource)`。语义是「key2 中第一个 * 之前的字符串前缀相等」，
 * **不是**按 `/` 分段匹配：`('/api/v1/users', '/api/v1/user*')` 在后端为 true。
 * 参数顺序不能交换，否则 `('/api/v1/tenants/*', '/api/v1/tenants')` 会退化成精确比较。
 */
export function keyMatch(requestPath: string, grantedResource: string): boolean {
  const star = grantedResource.indexOf('*')
  if (star === -1) {
    return requestPath === grantedResource
  }
  if (requestPath.length > star) {
    return requestPath.slice(0, star) === grantedResource.slice(0, star)
  }
  return requestPath === grantedResource.slice(0, star)
}

/** 身份未加载时一律 false：判定必须 fail-closed。 */
export function hasPermission(requestPath: string, action: string): boolean {
  const current = getIdentity()
  if (current === null) {
    return false
  }
  return current.permissions.some(
    (point) =>
      keyMatch(requestPath, point.resource) && (point.action === action || point.action === '*'),
  )
}
