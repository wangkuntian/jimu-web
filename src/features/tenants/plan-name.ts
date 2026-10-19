import type { Plan } from '../../shared/api/types'

/** plan_id=0 表示未分配；套餐列表命中则用套餐名，否则退回 #id。 */
export function resolvePlanName(planId: number, plans: Plan[]): string {
  if (planId === 0) {
    return '未分配'
  }
  return plans.find((plan) => plan.id === planId)?.name ?? `#${planId}`
}
