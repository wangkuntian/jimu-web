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
export const API_BASE_URL = new URL('/api/v1', window.location.origin).toString()
