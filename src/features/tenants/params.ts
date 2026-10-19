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
