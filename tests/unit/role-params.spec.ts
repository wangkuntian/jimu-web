import { describe, expect, it } from 'vitest'

import { buildRoleListQuery } from '../../src/features/roles/params'

describe('role list params', () => {
  it('omits blank filters and preserves status zero', () => {
    const query = buildRoleListQuery({
      page: 2,
      pageSize: 20,
      sort: 'name',
      order: 'asc',
      keyword: '   ',
      status: '',
      tenantId: '',
    })

    expect(query).toEqual({
      page: 2,
      page_size: 20,
      sort: 'name',
      order: 'asc',
    })

    expect(
      buildRoleListQuery({
        page: 1,
        pageSize: 20,
        sort: 'id',
        order: 'desc',
        keyword: ' 运营 ',
        status: 0,
        tenantId: 'tenant-1',
      }),
    ).toEqual({
      page: 1,
      page_size: 20,
      sort: 'id',
      order: 'desc',
      keyword: '运营',
      status: 0,
      tenant_id: 'tenant-1',
    })
  })
})
