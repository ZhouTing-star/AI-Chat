import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 用户信息接口
 * 定义当前登录用户的基本信息和权限
 * 暂时好像还没用到
 */
export interface UserProfile {
  // 用户唯一ID
  id: string
  // 用户名/昵称
  name: string
  // 用户权限列表（字符串数组）
  permissions: string[]
}

/**
 * 用户状态接口
 * 管理用户信息、权限相关的状态和操作
 */
interface UserState {
  // 用户资料对象
  profile: UserProfile
  // 设置完整的用户资料
  setProfile: (profile: UserProfile) => void
  // 单独更新用户权限列表
  setPermissions: (permissions: string[]) => void
  // 判断用户是否拥有某个权限
  hasPermission: (permission: string) => boolean
}

/**
 * 默认用户信息（本地用户默认配置）
 * 未登录/本地模式下使用的默认用户
 */
const defaultProfile: UserProfile = {
  id: 'u-local',           // 默认本地用户ID
  name: '本地用户',        // 默认用户名
  permissions: [           // 默认拥有的基础权限
    'chat.export',    // 导出聊天
    'chat.clear',     // 清空聊天
    'session.create'  // 创建会话
  ],
}

/**
 * 用户全局状态管理（Zustand + 持久化）
 * 用于管理用户信息、权限控制，状态会持久化到本地存储
 */
export const useUserStore = create(
  persist<UserState>(
    (set, get) => ({
      // 初始化：使用默认本地用户信息
      profile: defaultProfile,

      /**
       * 设置完整的用户资料
       * @param profile 完整的用户信息对象
       */
      setProfile: (profile: UserProfile) => set({ profile }),

      /**
       * 单独更新用户权限列表
       * 保留用户ID、名称等其他信息，只替换权限数组
       */
      setPermissions: (permissions: string[]) =>
        set((state) => ({
          profile: {
            ...state.profile,  // 保留原有用户信息
            permissions,       // 替换为新权限
          },
        })),

      /**
       * 权限校验方法
       * @param permission 要校验的权限标识
       * @returns 是否拥有该权限（true/false）
       * get() 用于获取当前最新的状态
       */
      hasPermission: (permission: string) => 
        get().profile.permissions.includes(permission),
    }),
    {
      // 本地存储的 key，持久化保存用户信息
      name: 'user-store',
    }
  )
)