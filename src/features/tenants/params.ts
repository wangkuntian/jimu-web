export type TenantSort = 'id' | 'code' | 'created_at'
export type TenantOrder = 'asc' | 'desc'
/** `''` 表示「不筛选」；`0`/`1` 是真实的筛选值（0=停用、1=启用）。 */
export type TenantStatusFilter = '' | 0 | 1

export interface TenantFilters {
  page: number
  pageSize: number
  sort: TenantSort
  order: TenantOrder
  keyword: string
  status: TenantStatusFilter
}

export interface TenantListQuery {
  page: number
  page_size: number
  sort: TenantSort
  order: TenantOrder
  keyword?: string
  status?: number
}

/**
 * 构造 /tenants 的查询参数。
 *
 * 两条必须守住的语义：
 * - 不筛选状态时必须**省略** status —— 显式写成 `?status=`（空串）会被 gin 按整数绑成 0，变成「只查停用」；
 * - `status: 0` 是合法筛选值，必须保留。
 * keyword 传原文（后端已对 `%`/`_`/`!` 转义并配 ESCAPE），空串省略。
 */
export function buildTenantListQuery(filters: TenantFilters): TenantListQuery {
  const keyword = filters.keyword.trim()
  const query: TenantListQuery = {
    page: filters.page,
    page_size: filters.pageSize,
    sort: filters.sort,
    order: filters.order,
  }

  if (keyword !== '') {
    query.keyword = keyword
  }
  if (filters.status !== '') {
    query.status = filters.status
  }

  return query
}

/**
 * 把页码收敛到 `[1, 最后一页]`。
 *
 * 结果集越小，之前停留的页码越可能越界：后端对越界页返回空数组 + 真实 total，
 * 直接渲染就会把「本页没有数据」伪装成「一个租户都没有」。
 */
export function clampPage(page: number, pageSize: number, total: number): number {
  if (total <= 0) {
    return 1
  }
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return Math.min(Math.max(1, page), lastPage)
}

/**
 * 租户 ID 是否落在 JS 安全整数范围内。
 *
 * 后端把雪花 ID 作为 JSON number 输出时，超出 `Number.MAX_SAFE_INTEGER` 的值会被
 * JSON.parse 成相邻的 double，再用 `String(...)` 拼回路径参数时可能被改写成另一个数字。
 * 这类 ID 的行内写操作会打到不存在的租户上，甚至拿到 `code:0` 的假成功——因此只允许
 * 精确可往返的 ID 发起写请求，不做 BigInt 补偿。
 */
export function isPreciseId(id: number): boolean {
  return Number.isSafeInteger(id)
}
