import { describe, expect, it } from 'vitest'

import { buildTenantListQuery, clampPage, isPreciseId } from '../../src/features/tenants/params'
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

describe('clampPage', () => {
  it('returns page 1 for an empty result set', () => {
    expect(clampPage(7, 20, 0)).toBe(1)
  })

  it('clamps a page beyond the last page to the last page', () => {
    expect(clampPage(5, 20, 25)).toBe(2)
    expect(clampPage(3, 20, 41)).toBe(3)
  })

  it('clamps page 0 and negative pages to 1', () => {
    expect(clampPage(0, 20, 25)).toBe(1)
    expect(clampPage(-3, 20, 25)).toBe(1)
  })

  it('leaves an in-range page untouched', () => {
    expect(clampPage(1, 20, 25)).toBe(1)
    expect(clampPage(2, 20, 25)).toBe(2)
  })

  it('still returns 1 when the page size exceeds the total', () => {
    expect(clampPage(4, 100, 25)).toBe(1)
  })
})

describe('isPreciseId', () => {
  it('accepts safe integers', () => {
    expect(isPreciseId(1)).toBe(true)
    expect(isPreciseId(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  it('rejects snowflake ids that exceed the safe integer range', () => {
    // `Number('...')` 就是 JSON.parse 对后端 number id 得到的结果（370528943163310100）。
    expect(isPreciseId(Number('370528943163310080'))).toBe(false)
    expect(isPreciseId(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
  })

  it('rejects non-integers', () => {
    expect(isPreciseId(1.5)).toBe(false)
    expect(isPreciseId(Number.NaN)).toBe(false)
  })
})
