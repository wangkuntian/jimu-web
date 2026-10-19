/**
 * API 前缀。
 *
 * 契约的 servers 是 `//localhost:8080/api/v1`（后端开发环境的 host + basePath），
 * 不能使用；path 键本身不含该前缀。
 *
 * 必须组成绝对 URL：openapi-fetch 走字符串拼接后调用 `new Request(url)`，
 * 相对 URL 在浏览器里能解析，但在 Node（单元测试环境）会抛
 * `TypeError: Failed to parse URL`。
 *
 * 开发环境由 Vite 代理 /api，生产环境同域反代，因此请求始终同源。
 */
export const API_PREFIX = '/api/v1'

export const API_BASE_URL = new URL(API_PREFIX, window.location.origin).toString()

/**
 * 把契约里的路径键（如 `/tenants`）拼成后端实际请求路径，也是权限点比对用的 key1。
 * 后端 matcher 拿的是完整请求路径（`/api/v1/tenants/7`），不是契约的路径键。
 */
export function apiResource(path: string): string {
  return `${API_PREFIX}${path}`
}
