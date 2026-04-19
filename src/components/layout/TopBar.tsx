import { WithPermission } from '../common/WithPermission'

/**
 * 顶部导航栏 Props 类型定义
 * 接收页面状态、配置、各种按钮的回调函数
 */
interface TopBarProps {
  title: string                  // 页面标题（会话名称）
  model: string                  // 当前使用的 AI 模型
  themeMode: 'light' | 'dark'    // 主题模式：浅色/深色
  isKnowledgeBasePage?: boolean  // 是否在【知识库页面】
  isStreaming: boolean           // 是否正在流式输出回答
  isPaused: boolean              // 是否暂停了流式输出
  canRegenerate: boolean         // 是否可以点击【重新生成】
  onOpenSidebar: () => void      // 打开侧边栏（移动端）
  onOpenKnowledgeBase: () => void // 打开知识库页面
  onBackToChat?: () => void      // 从知识库返回聊天
  onToggleTheme: () => void      // 切换浅色/深色主题
  onPause: () => void            // 暂停流式回答
  onResume: () => void           // 继续流式回答
  onRegenerate: () => void       // 重新生成回答
  onClear: () => void            // 清空当前对话
  onExport: () => void           // 导出对话记录
}

/**
 * 页面顶部导航栏
 * 功能：
 * 1. 显示当前会话标题 + 使用模型
 * 2. 切换主题（浅色/深色）
 * 3. 控制流式回答：暂停 / 继续 / 重新生成
 * 4. 清空对话、导出记录
 * 5. 页面切换：聊天 ↔ 知识库
 * 6. 移动端显示菜单按钮
 */
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
      {/* 左侧：菜单按钮 + 标题 + 模型信息 */}
      <div className="flex items-center gap-3">
        {/* 移动端：打开侧边栏按钮（电脑端隐藏） */}
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 lg:hidden"
          onClick={onOpenSidebar}
          aria-label="打开会话列表"
        >
          <span className="text-lg leading-none">≡</span>
        </button>

        {/* 标题 + 当前模型 */}
        <div>
          <p className="text-sm font-semibold text-slate-900 lg:text-base">{title}</p>
          <p className="text-xs text-slate-500">当前模型: {model}</p>
        </div>
      </div>

      {/* 右侧：所有功能按钮 */}
      <div className="flex items-center gap-2">
        {/* 页面切换按钮：聊天 ↔ 本地知识库 */}
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

        {/* 切换浅色/深色主题 */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
        >
          主题: {themeMode === 'light' ? '浅色' : '深色'}
        </button>

        {/* 👇 下面这些按钮只在【聊天页面】显示，知识库页面不显示 */}
        {!isKnowledgeBasePage && (
          <>
            {/* 流式回答控制：暂停 / 继续 */}
            <button
              type="button"
              onClick={isStreaming ? onPause : onResume}
              disabled={!isStreaming && !isPaused}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isStreaming ? '暂停' : '继续'}
            </button>

            {/* 重新生成回答 */}
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

        {/* 权限控制：清空对话按钮 */}
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

        {/* 权限控制：导出记录按钮 */}
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