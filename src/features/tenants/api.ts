import { api } from '../../shared/api/client'
import type { Plan, Tenant } from '../../shared/api/types'
import { resolveEnvelope, unwrap, unwrapEnvelope, unwrapOk } from '../../shared/api/unwrap'
import type { TenantListQuery } from './params'

export interface TenantPage {
  items: Tenant[]
  total: number
  page: number
  pageSize: number
}

export interface TenantCreateInput {
  code: string
  name: string
}

export interface TenantUpdateInput {
  name?: string
  status?: 0 | 1
}

/**
 * 租户列表。
 *
 * GET /tenants 是**信封型**响应：total/page/page_size 与 data 同级，
 * 因此必须走 unwrapEnvelope；用 unwrap 只取 data 会丢掉分页元数据。
 */
export async function listTenants(query: TenantListQuery): Promise<TenantPage> {
  const { data, error, response } = await api.GET('/tenants', { params: { query } })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return {
    items: unwrap<Tenant[]>(envelope),
    total: envelope.total ?? 0,
    page: envelope.page ?? query.page,
    pageSize: envelope.page_size ?? query.page_size,
  }
}

/** 套餐列表；契约上限 100，一次取满。 */
export async function listPlans(): Promise<Plan[]> {
  const { data, error, response } = await api.GET('/tenant-plans', {
    params: { query: { page: 1, page_size: 100 } },
  })
  const envelope = unwrapEnvelope(resolveEnvelope({ data, error, response }))

  return unwrap<Plan[]>(envelope)
}

/** 创建租户；编码全局唯一且创建后不可修改。 */
export async function createTenant(input: TenantCreateInput): Promise<Tenant> {
  const { data, error, response } = await api.POST('/tenants', { body: input })

  return unwrap<Tenant>(resolveEnvelope({ data, error, response }))
}

/** 更新名称或状态；编码不在契约的更新字段里。响应没有 data 键，用 unwrapOk。 */
export async function updateTenant(id: string, input: TenantUpdateInput): Promise<void> {
  const { data, error, response } = await api.PUT('/tenants/{id}', {
    params: { path: { id } },
    body: input,
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

/** 删除租户；默认租户受后端保护（409 + 5003），前端不做预判。 */
export async function deleteTenant(id: string): Promise<void> {
  const { data, error, response } = await api.DELETE('/tenants/{id}', { params: { path: { id } } })
  unwrapOk(resolveEnvelope({ data, error, response }))
}

/** 分配套餐；plan_id=0 表示取消套餐，请求体必须保留这个 0。 */
export async function assignTenantPlan(id: string, planId: number): Promise<void> {
  const { data, error, response } = await api.PUT('/tenants/{id}/plan', {
    params: { path: { id } },
    body: { plan_id: planId },
  })
  unwrapOk(resolveEnvelope({ data, error, response }))
}
