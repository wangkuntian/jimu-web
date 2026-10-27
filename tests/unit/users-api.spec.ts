import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import {
  assignUserRoles,
  createUser,
  deleteUser,
  getUser,
  listRoleOptions,
  listTenantOptions,
  listUsers,
  updateUser,
} from '../../src/features/users/api'
import { api } from '../../src/shared/api/client'

vi.mock('../../src/shared/api/client', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))

const getMock = api.GET as unknown as Mock
const postMock = api.POST as unknown as Mock
const putMock = api.PUT as unknown as Mock
const deleteMock = api.DELETE as unknown as Mock

const user = {
  id: '370528943163310080',
  username: 'alice',
  email: 'alice@example.com',
  phone: '13800000000',
  status: 1,
  tenant: { id: '370528943163310081', name: 'Acme' },
  roles: [{ id: '370528943163310082', name: 'developer' }],
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

describe('users api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists users with pagination metadata and string ids', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [user],
        total: 1,
        page: 1,
        page_size: 20,
      },
      response: new Response(null, { status: 200 }),
    })

    const query = { page: 1, page_size: 20, sort: 'id' as const, order: 'desc' as const }
    await expect(listUsers(query)).resolves.toEqual({
      items: [user],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(getMock).toHaveBeenCalledWith('/users', { params: { query } })
  })

  it('gets a user by the exact string id', async () => {
    getMock.mockResolvedValueOnce({
      data: { code: 0, data: user },
      response: new Response(null, { status: 200 }),
    })

    await expect(getUser(user.id)).resolves.toEqual(user)
    expect(getMock).toHaveBeenCalledWith('/users/{id}', { params: { path: { id: user.id } } })
  })

  it('creates a user with a target tenant and roles in one request', async () => {
    postMock.mockResolvedValueOnce({
      data: { code: 0, data: user },
      response: new Response(null, { status: 201 }),
    })
    const input = {
      tenant_id: user.tenant.id,
      username: user.username,
      password: 'secret123',
      email: user.email,
      phone: user.phone,
      role_ids: user.roles.map((role) => role.id),
    }

    await expect(createUser(input)).resolves.toEqual(user)
    expect(postMock).toHaveBeenCalledWith('/users', { body: input })
  })

  it('updates mutable profile fields without changing tenant or username', async () => {
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })
    const input = { status: 0 as const, email: 'new@example.com', phone: '' }

    await expect(updateUser(user.id, input)).resolves.toBeUndefined()
    expect(putMock).toHaveBeenCalledWith('/users/{id}', {
      params: { path: { id: user.id } },
      body: input,
    })
  })

  it('accepts the 204 response used by user deletion', async () => {
    deleteMock.mockResolvedValueOnce({
      data: undefined,
      response: new Response(null, { status: 204 }),
    })

    await expect(deleteUser(user.id)).resolves.toBeUndefined()
    expect(deleteMock).toHaveBeenCalledWith('/users/{id}', {
      params: { path: { id: user.id } },
    })
  })

  it('replaces all user roles with the provided ids', async () => {
    postMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await expect(assignUserRoles(user.id, ['r1', 'r2'])).resolves.toBeUndefined()
    expect(postMock).toHaveBeenCalledWith('/users/{id}/roles', {
      params: { path: { id: user.id } },
      body: { role_ids: ['r1', 'r2'] },
    })
  })

  it('lists assignable role options for the selected tenant', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [
          {
            id: 'r1',
            name: 'developer',
            code: '',
            scope: 'tenant',
            is_system: false,
          },
        ],
      },
      response: new Response(null, { status: 200 }),
    })

    await expect(listRoleOptions('t1')).resolves.toMatchObject([{ id: 'r1', name: 'developer' }])
    expect(getMock).toHaveBeenCalledWith('/roles/options', {
      params: { query: { tenant_id: 't1' } },
    })
  })

  it('lets the backend resolve the current tenant when no tenant id is supplied', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [],
      },
      response: new Response(null, { status: 200 }),
    })

    await expect(listRoleOptions()).resolves.toEqual([])
    expect(getMock).toHaveBeenCalledWith('/roles/options', {
      params: { query: {} },
    })
  })

  it('loads tenant options from the first 100 tenants', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [
          {
            id: 't1',
            code: 'acme',
            name: 'Acme',
            status: 1,
            plan_id: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      },
      response: new Response(null, { status: 200 }),
    })

    await expect(listTenantOptions()).resolves.toMatchObject([{ id: 't1', name: 'Acme' }])
    expect(getMock).toHaveBeenCalledWith('/tenants', {
      params: { query: { page: 1, page_size: 100, sort: 'id', order: 'asc' } },
    })
  })

  it('loads every tenant option page when the total exceeds 100', async () => {
    getMock
      .mockResolvedValueOnce({
        data: {
          code: 0,
          data: [
            { ...user.tenant, code: 'acme', status: 1, plan_id: 0, created_at: '', updated_at: '' },
          ],
          total: 101,
          page: 1,
          page_size: 100,
        },
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: {
          code: 0,
          data: [
            {
              id: 'tenant-101',
              code: 'last',
              name: 'Last',
              status: 1,
              plan_id: 0,
              created_at: '',
              updated_at: '',
            },
          ],
          total: 101,
          page: 2,
          page_size: 100,
        },
        response: new Response(null, { status: 200 }),
      })

    await expect(listTenantOptions()).resolves.toHaveLength(2)
    expect(getMock.mock.calls.map(([, init]) => init.params.query.page)).toEqual([1, 2])
  })
})
