import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { api } from '../../src/shared/api/client'
import {
  assignTenantPlan,
  createTenant,
  deleteTenant,
  listPlans,
  listTenants,
  updateTenant,
} from '../../src/features/tenants/api'
import { ApiError, ErrorCode } from '../../src/shared/api/unwrap'

vi.mock('../../src/shared/api/client', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))

const getMock = api.GET as unknown as Mock
const postMock = api.POST as unknown as Mock
const putMock = api.PUT as unknown as Mock
const deleteMock = api.DELETE as unknown as Mock

const query = { page: 1, page_size: 20, sort: 'id' as const, order: 'desc' as const }

describe('tenants api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the pagination metadata out of the runtime envelope', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        message: 'ok',
        data: [
          {
            id: '1',
            code: 'default',
            name: '默认租户',
            status: 1,
            plan_id: '0',
            created_at: '',
            updated_at: '',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        request_id: 'req-1',
      },
      response: new Response(null, { status: 200 }),
    })

    await expect(listTenants(query)).resolves.toEqual({
      items: [
        {
          id: '1',
          code: 'default',
          name: '默认租户',
          status: 1,
          plan_id: '0',
          created_at: '',
          updated_at: '',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(getMock).toHaveBeenCalledWith('/tenants', { params: { query } })
  })

  it('omits status from the request when the filter is empty', async () => {
    getMock.mockResolvedValueOnce({
      data: { code: 0, data: [], total: 0, page: 1, page_size: 20 },
      response: new Response(null, { status: 200 }),
    })

    await listTenants(query)

    const params = getMock.mock.calls[0]![1] as { params: { query: Record<string, unknown> } }
    expect('status' in params.params.query).toBe(false)
  })

  it('reports a 403 as ApiError(1003) so the page can render the no-permission state', async () => {
    getMock.mockResolvedValueOnce({
      data: { code: 1003, message: '无权限', request_id: 'req-2' },
      response: new Response(null, { status: 403 }),
    })

    // 页面用 `error instanceof ApiError` 分辨 403 与网络异常，因此这里连类型一起钉住。
    const rejection = listTenants(query)
    await expect(rejection).rejects.toBeInstanceOf(ApiError)
    await expect(rejection).rejects.toMatchObject({ code: ErrorCode.forbidden })
  })

  it('reads the error body of a non-2xx response, where openapi-fetch actually puts it', async () => {
    // 真实运行时 openapi-fetch 只在 2xx 写 data；403 的 JSON 落在 error 里，data 是 undefined。
    // 只读 data 会把 1003（无权限）退化成 unknown，页面就会渲染成错误态而不是无权限态。
    getMock.mockResolvedValueOnce({
      data: undefined,
      error: { code: 1003, message: '无权限', request_id: 'req-9' },
      response: new Response(null, { status: 403 }),
    })

    await expect(listTenants(query)).rejects.toMatchObject({
      code: ErrorCode.forbidden,
      requestId: 'req-9',
    })
  })

  it('lists plans from the paginated envelope', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: [
          { id: 1, code: 'free', name: '免费版', max_users: 5, max_roles: 3, max_api_keys: 2 },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      },
      response: new Response(null, { status: 200 }),
    })

    await expect(listPlans()).resolves.toEqual([
      { id: 1, code: 'free', name: '免费版', max_users: 5, max_roles: 3, max_api_keys: 2 },
    ])
  })

  it('returns the created tenant from the 201 body envelope', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          id: '4',
          code: 'acme',
          name: 'Acme',
          status: 1,
          plan_id: '0',
          created_at: '',
          updated_at: '',
        },
      },
      response: new Response(null, { status: 201 }),
    })

    await expect(createTenant({ code: 'acme', name: 'Acme' })).resolves.toMatchObject({
      id: '4',
      code: 'acme',
    })
    expect(postMock).toHaveBeenCalledWith('/tenants', { body: { code: 'acme', name: 'Acme' } })
  })

  it('accepts a write response whose data key was omitted', async () => {
    // PUT /tenants/{id} 实测返回 {"code":0,"message":"ok"}，用 unwrap 会误判成失败
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await expect(updateTenant('4', { name: 'Acme 2', status: 0 })).resolves.toBeUndefined()
  })

  it('surfaces the conflict when the default tenant refuses deletion', async () => {
    deleteMock.mockResolvedValueOnce({
      data: { code: 5003, message: '默认租户不可删除', request_id: 'req-3' },
      response: new Response(null, { status: 409 }),
    })

    await expect(deleteTenant('1')).rejects.toMatchObject({
      code: 5003,
      message: '默认租户不可删除',
      requestId: 'req-3',
    })
  })

  it('surfaces the 5003 conflict the backend sends on a real 409', async () => {
    // 真实 409 的响应体同样只在 error 里；少了这一步，「默认租户不可删除」的文案就丢了。
    deleteMock.mockResolvedValueOnce({
      data: undefined,
      error: { code: 5003, message: '默认租户不可删除', request_id: 'req-10' },
      response: new Response(null, { status: 409 }),
    })

    await expect(deleteTenant('1')).rejects.toMatchObject({
      code: 5003,
      message: '默认租户不可删除',
      requestId: 'req-10',
    })
  })

  it('assigns a plan with plan_id=0 to clear it', async () => {
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await expect(assignTenantPlan('4', '0')).resolves.toBeUndefined()
    expect(putMock).toHaveBeenCalledWith('/tenants/{id}/plan', {
      params: { path: { id: '4' } },
      body: { plan_id: '0' },
    })
  })

  it('assigns a snowflake plan id without changing its decimal string', async () => {
    const planId = '373398409660334080'
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await assignTenantPlan('4', planId)

    expect(putMock).toHaveBeenCalledWith('/tenants/{id}/plan', {
      params: { path: { id: '4' } },
      body: { plan_id: planId },
    })
  })

  it('keeps a large tenant id as the exact string returned by the backend', async () => {
    const id = '370528943163310080'
    putMock.mockResolvedValueOnce({
      data: { code: 0, message: 'ok' },
      response: new Response(null, { status: 200 }),
    })

    await updateTenant(id, { name: '运行时租户' })

    expect(putMock).toHaveBeenCalledWith('/tenants/{id}', {
      params: { path: { id } },
      body: { name: '运行时租户' },
    })
  })
})
