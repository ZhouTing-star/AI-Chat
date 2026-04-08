import { WithPermission } from '../common/WithPermission'

interface TopBarProps {
  title: string
  model: string
  themeMode: 'light' | 'dark'
  isKnowledgeBasePage?: boolean
  isStreaming: boolean
  isPaused: boolean
  canRegenerate: boolean
  onOpenSidebar: () => void
  onOpenKnowledgeBase: () => void
  onBackToChat?: () => void
  onToggleTheme: () => void
  onPause: () => void
  onResume: () => void
  onRegenerate: () => void
  onClear: () => void
  onExport: () => void
}

export function TopBar({
  title,
  model,
  themeMode,
  isKnowledgeBasePage = false,
  isStreaming,
  isPaused,
  canRegenerate,
  onOpenSidebar,
  onOpenKnowledgeBase,
  onBackToChat,
  onToggleTheme,
  onPause,
  onResume,
  onRegenerate,
  onClear,
  onExport,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 lg:hidden"
          onClick={onOpenSidebar}
          aria-label="打开会话列表"
        >
          <span className="text-lg leading-none">≡</span>
        </button>
        <div>
          <p className="text-sm font-semibold text-slate-900 lg:text-base">{title}</p>
          <p className="text-xs text-slate-500">当前模型: {model}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isKnowledgeBasePage ? (
          <button
            type="button"
            onClick={onBackToChat}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
          >
            返回聊天
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenKnowledgeBase}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
          >
            本地知识库
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
        >
          主题: {themeMode === 'light' ? '浅色' : '深色'}
        </button>

        {!isKnowledgeBasePage && (
          <>
            <button
              type="button"
              onClick={isStreaming ? onPause : onResume}
              disabled={!isStreaming && !isPaused}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isStreaming ? '暂停' : '继续'}
            </button>

            <button
              type="button"
              onClick={onRegenerate}
              disabled={!canRegenerate}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              重新生成
            </button>
          </>
        )}

        <WithPermission permission="chat.clear">
          {!isKnowledgeBasePage && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
            >
              清空
            </button>
          )}
        </WithPermission>

        <WithPermission permission="chat.export">
          {!isKnowledgeBasePage && (
            <button
              type="button"
              onClick={onExport}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
            >
              导出
            </button>
          )}
        </WithPermission>
      </div>
    </header>
  )
}
