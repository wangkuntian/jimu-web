import { describe, expect, it } from 'vitest'

import { buildUserListQuery } from '../../src/features/users/params'
import type { UserFilters } from '../../src/features/users/params'

const base: UserFilters = {
  page: 1,
  pageSize: 20,
  sort: 'id',
  order: 'desc',
  username: '',
  status: '',
  tenantId: '',
}

describe('buildUserListQuery', () => {
  it('omits empty filters and keeps pagination and sorting', () => {
    expect(buildUserListQuery(base)).toEqual({
      page: 1,
      page_size: 20,
      sort: 'id',
      order: 'desc',
    })
  })

  it('keeps status=0 as a real disabled filter', () => {
    expect(buildUserListQuery({ ...base, status: 0 })).toMatchObject({ status: 0 })
  })

  it('trims the username and keeps the exact tenant id', () => {
    expect(
      buildUserListQuery({
        ...base,
        username: '  alice  ',
        tenantId: '370528943163310080',
      }),
    ).toMatchObject({
      username: 'alice',
      tenant_id: '370528943163310080',
    })
  })
})
