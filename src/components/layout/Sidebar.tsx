import { useEffect, useRef, useState } from 'react'
import type { ChatSession } from '../../types/chat'

interface SidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  mobileOpen: boolean
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onRenameSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  onCloseMobile: () => void
}

export function Sidebar({
  sessions,
  activeSessionId,
  mobileOpen,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onCloseMobile,
}: SidebarProps) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) {
        return
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setMenuSessionId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const beginRename = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
    setMenuSessionId(null)
  }

  const submitRename = (sessionId: string) => {
    const nextTitle = editingTitle.trim()
    if (!nextTitle) {
      return
    }
    onRenameSession(sessionId, nextTitle)
    setEditingSessionId(null)
    setEditingTitle('')
  }

  const handleDelete = (session: ChatSession) => {
    setMenuSessionId(null)
    const confirmed = window.confirm(`确定删除会话“${session.title}”吗？`)
    if (!confirmed) {
      return
    }
    onDeleteSession(session.id)
  }

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
            const isEditing = session.id === editingSessionId
            const menuOpen = session.id === menuSessionId

            return (
              <div
                key={session.id}
                className={[
                  'mb-2 rounded-xl border p-3 transition',
                  active
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          submitRename(session.id)
                        }
                        if (event.key === 'Escape') {
                          setEditingSessionId(null)
                          setEditingTitle('')
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none ring-0 focus:border-sky-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSession(session.id)
                        onCloseMobile()
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-slate-900">{session.title}</p>
                    </button>
                  )}

                  <div className="relative" ref={menuOpen ? menuRef : undefined}>
                    <button
                      type="button"
                      aria-label="会话操作"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuSessionId((prev) => (prev === session.id ? null : session.id))
                      }}
                      className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                    >
                      ···
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-9 z-10 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => beginRename(session)}
                          className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                        >
                          编辑标题
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(session)}
                          className="w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 text-xs text-slate-500">{session.updatedAt}</span>
                </div>

                {isEditing && (
                  <div className="mb-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => submitRename(session.id)}
                      className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white transition hover:bg-slate-700"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSessionId(null)
                        setEditingTitle('')
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                    >
                      取消
                    </button>
                  </div>
                )}

                <p className="truncate text-xs text-slate-600">{session.preview}</p>
                <p className="mt-2 text-[11px] text-slate-500">{session.model}</p>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
