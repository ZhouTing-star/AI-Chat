import type { ReactNode } from 'react'
import { useUserStore } from '../../store/userStore'

interface WithPermissionProps {
  permission: string
  fallback?: ReactNode
  children: ReactNode
}

export function WithPermission({ permission, fallback = null, children }: WithPermissionProps) {
  const hasPermission = useUserStore((state) => state.hasPermission(permission))
  return hasPermission ? <>{children}</> : <>{fallback}</>
}
