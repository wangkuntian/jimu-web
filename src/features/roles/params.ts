export type RoleSort = 'id' | 'name' | 'created_at'
export type RoleOrder = 'asc' | 'desc'
export type RoleStatusFilter = '' | 0 | 1

export interface RoleFilters {
  page: number
  pageSize: number
  sort: RoleSort
  order: RoleOrder
  keyword: string
  status: RoleStatusFilter
  tenantId: string
}

export interface RoleListQuery {
  page: number
  page_size: number
  sort: RoleSort
  order: RoleOrder
  keyword?: string
  status?: number
  tenant_id?: string
}

/** 空筛选必须省略；status=0 是合法的“停用”筛选值。 */
export function buildRoleListQuery(filters: RoleFilters): RoleListQuery {
  const keyword = filters.keyword.trim()
  const query: RoleListQuery = {
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
  if (filters.tenantId !== '') {
    query.tenant_id = filters.tenantId
  }

  return query
}
