import type { ChatSession } from '../../types/chat'

interface SidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  mobileOpen: boolean
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onCloseMobile: () => void
}

export function Sidebar({
  sessions,
  activeSessionId,
  mobileOpen,
  onSelectSession,
  onNewSession,
  onCloseMobile,
}: SidebarProps) {
  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-30 w-80 shrink-0 border-r border-slate-200 bg-white/95 backdrop-blur',
        'transition-transform duration-300 lg:static lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
      aria-label="会话列表"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <button
            type="button"
            onClick={onNewSession}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            新建对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {sessions.map((session) => {
            const active = session.id === activeSessionId

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  onSelectSession(session.id)
                  onCloseMobile()
                }}
                className={[
                  'mb-2 w-full rounded-xl border p-3 text-left transition',
                  active
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {session.title}
                  </p>
                  <span className="shrink-0 text-xs text-slate-500">
                    {session.updatedAt}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-600">{session.preview}</p>
                <p className="mt-2 text-[11px] text-slate-500">{session.model}</p>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
