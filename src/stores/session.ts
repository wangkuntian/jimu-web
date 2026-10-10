import { defineStore } from 'pinia'

export interface SessionState {
  accessToken: string | null
  username: string | null
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    accessToken: null,
    username: null,
  }),
})
