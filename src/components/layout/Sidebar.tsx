import { useEffect, useRef, useState } from 'react'
import type { ChatSession } from '../../types/chat'

/**
 * 侧边栏组件 Props
 * 会话列表、当前激活会话、各种操作回调
 */
interface SidebarProps {
  sessions: ChatSession[]           // 会话列表
  activeSessionId: string            // 当前选中的会话 ID
  mobileOpen: boolean                // 移动端侧边栏是否打开
  onSelectSession: (sessionId: string) => void  // 选择会话
  onNewSession: () => void           // 新建会话
  onRenameSession: (sessionId: string, title: string) => void // 重命名会话
  onDeleteSession: (sessionId: string) => void   // 删除会话
  onCloseMobile: () => void          // 关闭移动端侧边栏
}

/**
 * 左侧会话侧边栏
 * 功能：
 * 1. 显示所有历史对话
 * 2. 新建会话
 * 3. 重命名会话
 * 4. 删除会话
 * 5. 点击切换会话
 * 6. 移动端自动折叠/展开
 */
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
  // 控制哪个会话的下拉菜单（...）打开
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  // 控制哪个会话处于【重命名编辑状态】
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  // 重命名输入框的内容
  const [editingTitle, setEditingTitle] = useState('')
  // 下拉菜单的 DOM 引用（用于点击外部关闭菜单）
  const menuRef = useRef<HTMLDivElement | null>(null)

  /**
   * 点击页面其他地方 → 关闭会话菜单
   */
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return
      // 如果点击的不是菜单内部 → 关闭菜单
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuSessionId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  /**
   * 开始重命名会话
   */
  const beginRename = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title) // 把原标题填入输入框
    setMenuSessionId(null) // 同时关闭菜单
  }

  /**
   * 提交重命名
   */
  const submitRename = (sessionId: string) => {
    const nextTitle = editingTitle.trim()
    if (!nextTitle) return // 标题不能为空

    onRenameSession(sessionId, nextTitle)
    setEditingSessionId(null) // 退出编辑状态
    setEditingTitle('')
  }

  /**
   * 删除会话（带确认框）
   */
  const handleDelete = (session: ChatSession) => {
    setMenuSessionId(null)
    // 浏览器弹窗确认
    const confirmed = window.confirm(`确定删除会话“${session.title}”吗？`)
    if (!confirmed) return

    onDeleteSession(session.id)
  }

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-30 w-80 shrink-0 border-r border-slate-200 bg-white/95 backdrop-blur',
        'transition-transform duration-300 lg:static lg:translate-x-0',
        // 移动端控制显示/隐藏
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
      aria-label="会话列表"
    >
      <div className="flex h-full flex-col">
        {/* 顶部：新建对话按钮 */}
        <div className="border-b border-slate-200 p-4">
          <button
            type="button"
            onClick={onNewSession}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            新建对话
          </button>
        </div>

        {/* 会话列表（可滚动） */}
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
                  // 当前选中会话高亮
                  active
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  {/* 重命名输入框 */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        // 回车保存 / ESC 取消
                        if (event.key === 'Enter') submitRename(session.id)
                        if (event.key === 'Escape') {
                          setEditingSessionId(null)
                          setEditingTitle('')
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none ring-0 focus:border-sky-400"
                    />
                  ) : (
                    // 会话标题（点击切换会话）
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSession(session.id)
                        onCloseMobile() // 移动端切完自动关闭侧边栏
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-slate-900">{session.title}</p>
                    </button>
                  )}

                  {/* 会话菜单（...） */}
                  <div className="relative" ref={menuOpen ? menuRef : undefined}>
                    <button
                      type="button"
                      aria-label="会话操作"
                      onClick={(event) => {
                        event.stopPropagation()
                        // 切换当前会话菜单显示/隐藏
                        setMenuSessionId((prev) => (prev === session.id ? null : session.id))
                      }}
                      className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                    >
                      ···
                    </button>

                    {/* 下拉菜单：编辑标题 + 删除 */}
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

                  {/* 会话更新时间 */}
                  <span className="shrink-0 text-xs text-slate-500">{session.updatedAt}</span>
                </div>

                {/* 编辑标题时显示：保存 / 取消 */}
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

                {/* 会话预览文字 */}
                <p className="truncate text-xs text-slate-600">{session.preview}</p>
                {/* 使用的模型名称 */}
                <p className="mt-2 text-[11px] text-slate-500">{session.model}</p>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}