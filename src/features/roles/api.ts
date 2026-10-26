import { api } from '../../shared/api/client'
import type {
  CreateRoleInput,
  Permission,
  Role,
  Tenant,
  UpdateRoleInput,
} from '../../shared/api/types'
import { resolveEnvelope, unwrap, unwrapEnvelope, unwrapOk } from '../../shared/api/unwrap'
import type { RoleListQuery } from './params'

export interface RolePage {
  items: Role[]
  total: number
  page: number
  pageSize: number
}

const OPTION_PAGE_SIZE = 100

async function loadAllOptionPages<T>(
  loadPage: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = []
  let page = 1

  while (true) {
    const result = await loadPage(page)
    items.push(...result.items)
    if (result.items.length === 0 || page * OPTION_PAGE_SIZE >= result.total) {
      return items
    }
    page += 1
  }
}

export async function listRoles(query: RoleListQuery): Promise<RolePage> {
  const { data, error, response } = await api.GET('/roles', { params: { query } })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return {
    items: unwrap<Role[]>(envelope),
    total: envelope.total ?? 0,
    page: envelope.page ?? query.page,
    pageSize: envelope.page_size ?? query.page_size,
  }
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  const { data, error, response } = await api.POST('/roles', { body: input })
  return unwrap<Role>(resolveEnvelope({ data, error, response }))
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<void> {
  const { data, error, response } = await api.PUT('/roles/{id}', {
    params: { path: { id } },
    body: input,
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

/** DELETE 表示停用，后端成功返回 204。 */
export async function disableRole(id: string): Promise<void> {
  const { data, error, response } = await api.DELETE('/roles/{id}', {
    params: { path: { id } },
  })

  if (response.status === 204) {
    return
  }
  unwrapOk(resolveEnvelope({ data, error, response }))
}

export async function listPermissions(): Promise<Permission[]> {
  return loadAllOptionPages(async (page) => {
    const { data, error, response } = await api.GET('/permissions', {
      params: {
        query: {
          page,
          page_size: OPTION_PAGE_SIZE,
          sort: 'resource',
          order: 'asc',
        },
      },
    })
    const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

    return {
      items: unwrap<Permission[]>(envelope),
      total: envelope.total ?? 0,
    }
  })
}

export async function getRolePermissions(id: string): Promise<Permission[]> {
  const { data, error, response } = await api.GET('/roles/{id}/permissions', {
    params: { path: { id } },
  })
  return unwrap<Permission[]>(resolveEnvelope({ data, error, response }))
}

export async function assignRolePermissions(id: string, permissionIds: string[]): Promise<void> {
  const { data, error, response } = await api.POST('/roles/{id}/permissions', {
    params: { path: { id } },
    body: { permission_ids: permissionIds },
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

export async function listTenantOptions(): Promise<Tenant[]> {
  return loadAllOptionPages(async (page) => {
    const { data, error, response } = await api.GET('/tenants', {
      params: {
        query: { page, page_size: OPTION_PAGE_SIZE, sort: 'id', order: 'asc' },
      },
    })
    const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

    return {
      items: unwrap<Tenant[]>(envelope),
      total: envelope.total ?? 0,
    }
  })
}
