export type UserSort = 'id' | 'username' | 'created_at'
export type UserOrder = 'asc' | 'desc'
export type UserStatusFilter = '' | 0 | 1

export interface UserFilters {
  page: number
  pageSize: number
  sort: UserSort
  order: UserOrder
  username: string
  status: UserStatusFilter
  tenantId: string
}

export interface UserListQuery {
  page: number
  page_size: number
  sort: UserSort
  order: UserOrder
  username?: string
  status?: number
  tenant_id?: string
}

/** 空筛选必须省略，避免把「不过滤」编码成后端会当成真实条件的空值。 */
export function buildUserListQuery(filters: UserFilters): UserListQuery {
  const query: UserListQuery = {
    page: filters.page,
    page_size: filters.pageSize,
    sort: filters.sort,
    order: filters.order,
  }
  const username = filters.username.trim()

  if (username !== '') {
    query.username = username
  }
  if (filters.status !== '') {
    query.status = filters.status
  }
  if (filters.tenantId !== '') {
    query.tenant_id = filters.tenantId
  }

  return query
}
