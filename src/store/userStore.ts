import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserProfile {
  id: string
  name: string
  permissions: string[]
}

interface UserState {
  profile: UserProfile
  setProfile: (profile: UserProfile) => void
  setPermissions: (permissions: string[]) => void
  hasPermission: (permission: string) => boolean
}

const defaultProfile: UserProfile = {
  id: 'u-local',
  name: '本地用户',
  permissions: ['chat.export', 'chat.clear', 'session.create'],
}

export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      profile: defaultProfile,
      setProfile: (profile: UserProfile) => set({ profile }),
      setPermissions: (permissions: string[]) =>
        set((state) => ({
          profile: {
            ...state.profile,
            permissions,
          },
        })),
      hasPermission: (permission: string) => get().profile.permissions.includes(permission),
    }),
    {
      name: 'user-store',
    }
  )
)
