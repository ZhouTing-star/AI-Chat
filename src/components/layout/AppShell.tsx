import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
  mobileSidebarOpen: boolean
  onCloseMobileSidebar: () => void
}

export function AppShell({
  sidebar,
  header,
  children,
  mobileSidebarOpen,
  onCloseMobileSidebar,
}: AppShellProps) {
  return (
    <div className="relative mx-auto flex h-screen w-full max-w-[1440px] overflow-hidden bg-slate-50 lg:p-4">
      {mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-900/35 lg:hidden"
          aria-label="关闭侧边栏"
          onClick={onCloseMobileSidebar}
        />
      )}

      {sidebar}

      <section className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50 lg:ml-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
        {header}
        {children}
      </section>
    </div>
  )
}
