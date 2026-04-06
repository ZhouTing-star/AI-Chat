interface TopBarProps {
  title: string
  model: string
  onOpenSidebar: () => void
}

export function TopBar({ title, model, onOpenSidebar }: TopBarProps) {
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
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
        >
          清空
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
        >
          导出
        </button>
      </div>
    </header>
  )
}
