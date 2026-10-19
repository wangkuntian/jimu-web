import { QueryClient } from '@tanstack/vue-query'

/**
 * 列表/详情共用的 QueryClient。
 *
 * `retry: false`：403（无权限）与 400（排序字段非法）重试没有意义，错误状态由页面自己给「重试」按钮。
 * `staleTime` 30s：管理页同一视图内来回切换筛选不必每次重打后端。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  },
})
