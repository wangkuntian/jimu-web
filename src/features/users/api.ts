import { api } from '../../shared/api/client'
import type { CreateUserInput, Role, Tenant, UpdateUserInput, User } from '../../shared/api/types'
import { resolveEnvelope, unwrap, unwrapEnvelope, unwrapOk } from '../../shared/api/unwrap'
import type { UserListQuery } from './params'

export interface UserPage {
  items: User[]
  total: number
  page: number
  pageSize: number
}

export async function listUsers(query: UserListQuery): Promise<UserPage> {
  const { data, error, response } = await api.GET('/users', { params: { query } })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return {
    items: unwrap<User[]>(envelope),
    total: envelope.total ?? 0,
    page: envelope.page ?? query.page,
    pageSize: envelope.page_size ?? query.page_size,
  }
}

export async function getUser(id: string): Promise<User> {
  const { data, error, response } = await api.GET('/users/{id}', {
    params: { path: { id } },
  })

  return unwrap<User>(resolveEnvelope({ data, error, response }))
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { data, error, response } = await api.POST('/users', { body: input })

  return unwrap<User>(resolveEnvelope({ data, error, response }))
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<void> {
  const { data, error, response } = await api.PUT('/users/{id}', {
    params: { path: { id } },
    body: input,
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

/** DELETE 在这里表示停用；后端成功返回 204，没有信封可解。 */
export async function disableUser(id: string): Promise<void> {
  const { data, error, response } = await api.DELETE('/users/{id}', {
    params: { path: { id } },
  })

  if (response.status === 204) {
    return
  }
  unwrapOk(resolveEnvelope({ data, error, response }))
}

export async function assignUserRoles(id: string, roleIds: string[]): Promise<void> {
  const { data, error, response } = await api.POST('/users/{id}/roles', {
    params: { path: { id } },
    body: { role_ids: roleIds },
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

export async function listRoles(tenantId: string): Promise<Role[]> {
  const { data, error, response } = await api.GET('/roles', {
    params: {
      query: {
        page: 1,
        page_size: 100,
        sort: 'id',
        order: 'asc',
        tenant_id: tenantId,
      },
    },
  })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return unwrap<Role[]>(envelope)
}

export async function listTenantOptions(): Promise<Tenant[]> {
  const { data, error, response } = await api.GET('/tenants', {
    params: {
      query: { page: 1, page_size: 100, sort: 'id', order: 'asc' },
    },
  })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return unwrap<Tenant[]>(envelope)
}
