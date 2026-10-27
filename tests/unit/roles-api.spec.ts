import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getRolePermissions,
  listPermissions,
  listRoles,
  updateRole,
} from '../../src/features/roles/api'
import { api } from '../../src/shared/api/client'

vi.mock('../../src/shared/api/client', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))

const getMock = api.GET as unknown as Mock
const postMock = api.POST as unknown as Mock
const putMock = api.PUT as unknown as Mock
const deleteMock = api.DELETE as unknown as Mock

const role = {
  id: '370528943163310080',
  tenant_id: '1',
  name: '运营管理员',
  description: '负责租户运营',
  status: 1,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
}

const permission = {
  id: '370528943163420080',
  name: '用户列表',
  resource: '/api/v1/users',
  action: 'GET',
  created_at: '2026-10-19T00:00:00Z',
}

describe('roles api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads role pagination metadata and keeps string ids', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [role],
        total: 1,
        page: 1,
        page_size: 20,
      },
      response: new Response(null, { status: 200 }),
    })

    const query = {
      page: 1,
      page_size: 20,
      sort: 'id' as const,
      order: 'desc' as const,
      tenant_id: role.tenant_id,
    }
    await expect(listRoles(query)).resolves.toEqual({
      items: [role],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(getMock).toHaveBeenCalledWith('/roles', { params: { query } })
  })

  it('creates a role inside the selected tenant', async () => {
    postMock.mockResolvedValueOnce({
      data: { code: 0, data: role },
      response: new Response(null, { status: 201 }),
    })
    const input = {
      tenant_id: role.tenant_id,
      name: role.name,
      description: role.description,
    }

    await expect(createRole(input)).resolves.toEqual(role)
    expect(postMock).toHaveBeenCalledWith('/roles', { body: input })
  })

  it('updates the role status and description', async () => {
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })
    const input = { name: role.name, description: '新职责', status: 0 as const }

    await expect(updateRole(role.id, input)).resolves.toBeUndefined()
    expect(putMock).toHaveBeenCalledWith('/roles/{id}', {
      params: { path: { id: role.id } },
      body: input,
    })
  })

  it('accepts the 204 response used by permanent role deletion', async () => {
    deleteMock.mockResolvedValueOnce({
      data: undefined,
      response: new Response(null, { status: 204 }),
    })

    await expect(deleteRole(role.id)).resolves.toBeUndefined()
    expect(deleteMock).toHaveBeenCalledWith('/roles/{id}', {
      params: { path: { id: role.id } },
    })
  })

  it('loads every permission page with string ids', async () => {
    getMock
      .mockResolvedValueOnce({
        data: {
          code: 0,
          data: [permission],
          total: 101,
          page: 1,
          page_size: 100,
        },
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: {
          code: 0,
          data: [{ ...permission, id: 'permission-101', name: '审计日志' }],
          total: 101,
          page: 2,
          page_size: 100,
        },
        response: new Response(null, { status: 200 }),
      })

    await expect(listPermissions()).resolves.toMatchObject([
      { id: permission.id },
      { id: 'permission-101' },
    ])
    expect(getMock).toHaveBeenNthCalledWith(1, '/permissions', {
      params: {
        query: { page: 1, page_size: 100, sort: 'resource', order: 'asc' },
      },
    })
    expect(getMock).toHaveBeenNthCalledWith(2, '/permissions', {
      params: {
        query: { page: 2, page_size: 100, sort: 'resource', order: 'asc' },
      },
    })
  })

  it('reads the current role permissions as an empty array', async () => {
    getMock.mockResolvedValueOnce({
      data: { code: 0, data: [] },
      response: new Response(null, { status: 200 }),
    })

    await expect(getRolePermissions(role.id)).resolves.toEqual([])
    expect(getMock).toHaveBeenCalledWith('/roles/{id}/permissions', {
      params: { path: { id: role.id } },
    })
  })

  it('replaces role permissions and allows an empty selection', async () => {
    postMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await expect(assignRolePermissions(role.id, [permission.id])).resolves.toBeUndefined()
    expect(postMock).toHaveBeenLastCalledWith('/roles/{id}/permissions', {
      params: { path: { id: role.id } },
      body: { permission_ids: [permission.id] },
    })

    postMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })
    await expect(assignRolePermissions(role.id, [])).resolves.toBeUndefined()
    expect(postMock).toHaveBeenLastCalledWith('/roles/{id}/permissions', {
      params: { path: { id: role.id } },
      body: { permission_ids: [] },
    })
  })
})
