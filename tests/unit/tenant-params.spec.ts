import { describe, expect, it } from 'vitest'

import { buildTenantListQuery } from '../../src/features/tenants/params'
import type { TenantFilters } from '../../src/features/tenants/params'

const base: TenantFilters = {
  page: 1,
  pageSize: 20,
  sort: 'id',
  order: 'desc',
  keyword: '',
  status: '',
}

describe('buildTenantListQuery', () => {
  it('omits status entirely when no filter is selected', () => {
    const query = buildTenantListQuery(base)

    // ?status= 会被 gin 绑成 0（只查停用），因此「不过滤」必须省略该参数
    expect('status' in query).toBe(false)
    expect(query).toEqual({ page: 1, page_size: 20, sort: 'id', order: 'desc' })
  })

  it('keeps status=0 because it is a real filter value', () => {
    expect(buildTenantListQuery({ ...base, status: 0 })).toMatchObject({ status: 0 })
  })

  it('keeps status=1', () => {
    expect(buildTenantListQuery({ ...base, status: 1 })).toMatchObject({ status: 1 })
  })

  it('omits a blank keyword and trims a real one', () => {
    expect('keyword' in buildTenantListQuery({ ...base, keyword: '   ' })).toBe(false)
    expect(buildTenantListQuery({ ...base, keyword: '  acme  ' })).toMatchObject({
      keyword: 'acme',
    })
  })

  it('passes the keyword through untransformed so the backend can escape it', () => {
    expect(buildTenantListQuery({ ...base, keyword: 'a%_!b' })).toMatchObject({ keyword: 'a%_!b' })
  })

  it('keeps pagination and sorting', () => {
    expect(
      buildTenantListQuery({ ...base, page: 3, pageSize: 50, sort: 'created_at', order: 'asc' }),
    ).toEqual({ page: 3, page_size: 50, sort: 'created_at', order: 'asc' })
  })
})
