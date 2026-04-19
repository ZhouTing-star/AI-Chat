import type { ReactNode } from 'react'
// 引入用户状态管理（存储用户信息、权限列表）
import { useUserStore } from '../../store/userStore'

/**
 * 权限控制组件 Props
 * permission：需要校验的权限标识（如 'chat.clear'）
 * fallback：没有权限时显示的内容（默认不显示：null）
 * children：有权限时显示的内容
 */
interface WithPermissionProps {
  permission: string
  fallback?: ReactNode
  children: ReactNode
}

/**
 * 【权限控制组件】
 * 作用：根据当前用户是否拥有指定权限，来决定渲染什么内容
 * 用法：
 * <WithPermission permission="chat.delete">
 *   <button>删除</button>
 * </WithPermission>
 */
export function WithPermission({ permission, fallback = null, children }: WithPermissionProps) {
  // 从全局状态中获取：当前用户是否具备该权限
  const hasPermission = useUserStore((state) => state.hasPermission(permission))

  // 有权限 → 显示子组件
  // 无权限 → 显示 fallback（默认不显示）
  return hasPermission ? <>{children}</> : <>{fallback}</>
}