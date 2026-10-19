import { describe, expect, it } from 'vitest'

import { resolvePlanName } from '../../src/features/tenants/plan-name'
import type { Plan } from '../../src/shared/api/types'

const plans: Plan[] = [
  { id: 1, code: 'free', name: '免费版', max_users: 5, max_roles: 3, max_api_keys: 2 },
  { id: 2, code: 'pro', name: '专业版', max_users: 50, max_roles: 20, max_api_keys: 10 },
]

describe('resolvePlanName', () => {
  it('maps plan_id=0 to the unassigned label', () => {
    expect(resolvePlanName(0, plans)).toBe('未分配')
  })

  it('maps a known plan id to its name', () => {
    expect(resolvePlanName(2, plans)).toBe('专业版')
  })

  it('falls back to the raw id when the plan list does not contain it', () => {
    expect(resolvePlanName(9, plans)).toBe('#9')
    expect(resolvePlanName(9, [])).toBe('#9')
  })
})
