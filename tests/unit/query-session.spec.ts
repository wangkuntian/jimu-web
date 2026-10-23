import { beforeEach, describe, expect, it } from 'vitest'

import { queryClient, registerQueryCacheReset } from '../../src/app/query'
import { clearSession, saveSession } from '../../src/shared/auth/session'

describe('query cache session binding', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  it('clears cached server data whenever the session is cleared', () => {
    const dispose = registerQueryCacheReset()
    saveSession({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 })
    queryClient.setQueryData(['users', 'scope'], [{ id: 'user-1' }])

    clearSession()

    expect(queryClient.getQueryData(['users', 'scope'])).toBeUndefined()
    dispose()
  })

  it('stops clearing data after the binding is disposed', () => {
    const dispose = registerQueryCacheReset()
    dispose()
    queryClient.setQueryData(['users', 'scope'], [{ id: 'user-1' }])

    clearSession()

    expect(queryClient.getQueryData(['users', 'scope'])).toEqual([{ id: 'user-1' }])
  })
})
