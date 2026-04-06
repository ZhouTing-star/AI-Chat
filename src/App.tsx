import { useMemo, useState } from 'react'
import { ChatInput } from './components/chat/ChatInput'
import { MessageList } from './components/chat/MessageList'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { mockMessagesBySession, mockSessions } from './mocks/chatData'
import type { ChatMessage, ChatSession, UploadItem } from './types/chat'

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function nextStreamingChunkLength(currentLength: number): number {
  return currentLength < 24 ? 8 : 12
}

function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(mockSessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(mockSessions[0].id)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [messagesBySession, setMessagesBySession] = useState<Map<string, ChatMessage[]>>(
    () => new Map(Object.entries(mockMessagesBySession)),
  )

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) ?? sessions[0]
  }, [activeSessionId, sessions])

  const activeMessages = messagesBySession.get(activeSessionId) ?? []

  const pushMessage = (sessionId: string, message: ChatMessage) => {
    setMessagesBySession((prev) => {
      const next = new Map(prev)
      const list = next.get(sessionId) ?? []
      next.set(sessionId, [...list, message])
      return next
    })
  }

  const patchLastAssistantMessage = (
    sessionId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessagesBySession((prev) => {
      const next = new Map(prev)
      const list = [...(next.get(sessionId) ?? [])]

      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (list[index].role === 'assistant') {
          list[index] = updater(list[index])
          break
        }
      }

      next.set(sessionId, list)
      return next
    })
  }

  const updateSessionPreview = (sessionId: string, preview: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              preview,
              updatedAt: nowTimeLabel(),
            }
          : session,
      ),
    )
  }

  const startMockStreamingReply = (sessionId: string, prompt: string) => {
    const assistantId = crypto.randomUUID()
    const fullReply = `收到你的需求：${prompt}。\n\n已为你预留 SSE 流式渲染与分片上传的页面位置，下一步可以直接接入后端接口。`

    pushMessage(sessionId, {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: nowTimeLabel(),
      status: 'streaming',
    })

    let cursor = 0
    const timer = window.setInterval(() => {
      const step = nextStreamingChunkLength(cursor)
      cursor = Math.min(cursor + step, fullReply.length)

      patchLastAssistantMessage(sessionId, (message) => ({
        ...message,
        content: fullReply.slice(0, cursor),
        status: cursor >= fullReply.length ? 'done' : 'streaming',
      }))

      if (cursor >= fullReply.length) {
        window.clearInterval(timer)
        updateSessionPreview(sessionId, fullReply.slice(0, 28))
      }
    }, 120)
  }

  const handleNewSession = () => {
    const id = crypto.randomUUID()
    const session: ChatSession = {
      id,
      title: '新对话',
      updatedAt: nowTimeLabel(),
      preview: '开始新的提问。',
      model: 'Qwen-Plus',
    }

    setSessions((prev) => [session, ...prev])
    setMessagesBySession((prev) => {
      const next = new Map(prev)
      next.set(id, [])
      return next
    })
    setActiveSessionId(id)
    setMobileSidebarOpen(false)
  }

  const handlePickFile = (files: FileList) => {
    const queuedItems: UploadItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'queued',
    }))

    setUploads((prev) => [...prev, ...queuedItems])

    queuedItems.forEach((item) => {
      let progress = 0

      const timer = window.setInterval(() => {
        progress = Math.min(progress + 20, 100)

        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === item.id
              ? {
                  ...upload,
                  progress,
                  status: progress >= 100 ? 'done' : 'uploading',
                }
              : upload,
          ),
        )

        if (progress >= 100) {
          window.clearInterval(timer)
        }
      }, 160)
    })
  }

  const handleSend = () => {
    const prompt = inputValue.trim()

    if (!prompt) {
      return
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      createdAt: nowTimeLabel(),
      status: 'done',
    }

    pushMessage(activeSessionId, message)
    updateSessionPreview(activeSessionId, prompt)
    setInputValue('')
    startMockStreamingReply(activeSessionId, prompt)
  }

  const removeUpload = (uploadId: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== uploadId))
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] bg-slate-50 lg:p-4">
      {mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-900/35 lg:hidden"
          aria-label="关闭侧边栏"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <section className="flex min-h-screen flex-1 flex-col bg-slate-50 lg:ml-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
        <TopBar
          title={activeSession.title}
          model={activeSession.model}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
        />

        <div className="flex-1 overflow-hidden">
          <MessageList messages={activeMessages} />
        </div>

        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onPickFile={handlePickFile}
          onRemoveUpload={removeUpload}
          uploads={uploads}
        />
      </section>
    </div>
  )
}

export default App
