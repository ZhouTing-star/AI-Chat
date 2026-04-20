import { ChatPage } from '../pages/chat/ChatPage'
import { KnowledgeBasePage } from '../pages/knowledge/KnowledgeBasePage'
import { useUIStore } from '../store/uiStore'

export function AppRouter() {
  const page = useUIStore((state) => state.page)

  return (
    <>
      <div className={page === 'chat' ? 'h-full' : 'hidden'}>
        <ChatPage />
      </div>
      <div className={page === 'knowledge-base' ? 'h-full' : 'hidden'}>
        <KnowledgeBasePage />
      </div>
    </>
  )
}
