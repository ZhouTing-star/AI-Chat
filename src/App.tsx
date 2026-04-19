import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatInput } from './components/chat/ChatInput'
import { MessageList } from './components/chat/MessageList'
import { KnowledgeBasePage } from './components/knowledge/KnowledgeBasePage'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { streamChatReply } from './services/chatStream'
import { useChatStore } from './store/chatStore'
import { useSessionStore } from './store/sessionStore'
import { useThemeStore } from './store/themeStore'
import { useUIStore } from './store/uiStore'
import type { AnswerMode, ChatMessage, UploadItem } from './types/chat'
import {
  createAttachmentFromFile,
  formatSize,
  isFileTypeAllowed,
  MAX_FILE_SIZE,
} from './utils/attachmentParser'

/**
 * 流式任务元数据
 * 存储正在流式输出的对话信息，用于暂停/继续/重生成
 */
interface StreamTaskMeta {
  assistantId: string
  prompt: string
  model: string
  answerMode: AnswerMode
  baseContext: ChatMessage[]
}

/**
 * 获取当前时间（格式化：HH:MM）
 * 用于消息气泡的时间显示
 */
function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * 项目根组件：App
 * 功能：
 * 1. 全局状态管理
 * 2. 聊天逻辑（发送、流式输出、暂停、继续、重生成）
 * 3. 文件上传
 * 4. 页面切换（聊天 / 知识库）
 * 5. 会话管理
 * 6. 主题切换
 */
function App() {
  // 存储流式关闭函数，用于中断请求
  const streamClosersRef = useRef<Map<string, () => void>>(new Map())
  // 存储流式任务元数据，用于暂停后恢复
  const streamTasksRef = useRef<Map<string, StreamTaskMeta>>(new Map())
  // 控制“重新生成”按钮是否可用
  const [regenerateFlags, setRegenerateFlags] = useState<Record<string, boolean>>({})
  const setCanRegenerate = (sessionId: string, canRegenerate: boolean) => {
    setRegenerateFlags((prev) => ({
      ...prev,
      [sessionId]: canRegenerate,
    }))
  }

  // ====================== 会话状态 ======================
  const sessions = useSessionStore((state) => state.sessions)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const setActiveSessionId = useSessionStore((state) => state.setActiveSessionId)
  const createSession = useSessionStore((state) => state.createSession)
  const renameSession = useSessionStore((state) => state.renameSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const updateSessionPreview = useSessionStore((state) => state.updateSessionPreview)
  const updateSessionAnswerMode = useSessionStore((state) => state.updateSessionAnswerMode)

  // ====================== 聊天消息状态 ======================
  const messagesBySession = useChatStore((state) => state.messagesBySession)
  const ensureSession = useChatStore((state) => state.ensureSession)
  const pushMessage = useChatStore((state) => state.pushMessage)
  const addChunkMessage = useChatStore((state) => state.addChunkMessage)
  const clearSessionMessages = useChatStore((state) => state.clearSessionMessages)
  const removeMessageById = useChatStore((state) => state.removeMessageById)
  const appendToMessageById = useChatStore((state) => state.appendToMessageById)
  const updateMessageById = useChatStore((state) => state.updateMessageById)
  const removeSessionData = useChatStore((state) => state.removeSessionData)
  const setSessionStreaming = useChatStore((state) => state.setSessionStreaming)
  const setSessionPaused = useChatStore((state) => state.setSessionPaused)
  const isStreaming = useChatStore(
    (state) => state.sessionStreaming[activeSessionId] ?? false,
  )
  const isPaused = useChatStore((state) => state.sessionPaused[activeSessionId] ?? false)

  // ====================== 主题状态 ======================
  const themeMode = useThemeStore((state) => state.mode)
  const toggleTheme = useThemeStore((state) => state.toggleMode)

  // ====================== UI 状态 ======================
  const mobileSidebarOpen = useUIStore((state) => state.mobileSidebarOpen)
  const page = useUIStore((state) => state.page)
  const activeKnowledgeBaseId = useUIStore((state) => state.activeKnowledgeBaseId)
  const inputValue = useUIStore((state) => state.inputValue)
  const uploads = useUIStore((state) => state.uploads)
  const setPage = useUIStore((state) => state.setPage)
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen)
  const setInputValue = useUIStore((state) => state.setInputValue)
  const addUploads = useUIStore((state) => state.addUploads)
  const updateUpload = useUIStore((state) => state.updateUpload)
  const removeUpload = useUIStore((state) => state.removeUpload)
  const removeUploadsBySession = useUIStore((state) => state.removeUploadsBySession)

  // 当前激活的会话
  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null
  }, [activeSessionId, sessions])

  // 当前会话的消息列表
  const activeMessages = messagesBySession.get(activeSessionId) ?? []
  // 当前会话的上传文件
  const activeUploads = useMemo(
    () => uploads.filter((item) => item.sessionId === activeSessionId),
    [uploads, activeSessionId],
  )
  // 是否有文件正在上传
  const activeUploadsUploading = useMemo(
    () => activeUploads.some((item) => item.status === 'queued' || item.status === 'uploading'),
    [activeUploads],
  )
  // 当前会话的回答模式
  const activeAnswerMode: AnswerMode = activeSession?.answerMode ?? 'balanced'

  // 切换主题（light/dark）
  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  // 页面卸载时关闭所有流式连接
  useEffect(() => {
    const streamClosers = streamClosersRef.current

    return () => {
      streamClosers.forEach((close) => close())
      streamClosers.clear()
    }
  }, [])

  // 初始化：无会话时自动创建会话
  useEffect(() => {
    if (sessions.length === 0) {
      const created = createSession('glm-4-flash')
      ensureSession(created.id)
      return
    }

    const exists = sessions.some((session) => session.id === activeSessionId)
    if (!exists) {
      setActiveSessionId(sessions[0].id)
    }
  }, [activeSessionId, createSession, ensureSession, sessions, setActiveSessionId])

  // ====================== 核心：启动流式回答 ======================
  const startStreamReply = (
    sessionId: string,
    prompt: string,
    model: string,
    answerMode: AnswerMode,
    contextMessages: ChatMessage[],
    assistantIdOverride?: string,
  ) => {
    const assistantId = assistantIdOverride ?? crypto.randomUUID()
    const tokenKey = (import.meta.env.VITE_AUTH_TOKEN_KEY as string | undefined) ?? 'access_token'
    const token = window.localStorage.getItem(tokenKey) ?? undefined

    // 覆盖模式：更新已有消息为流式状态
    if (assistantIdOverride) {
      updateMessageById(sessionId, assistantId, (message) => ({
        ...message,
        status: 'streaming',
      }))
    } else {
      // 新增 AI 消息（空内容，流式填充）
      pushMessage(sessionId, {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: nowTimeLabel(),
        status: 'streaming',
        citations: [],
        answerMode,
      })
    }

    setSessionStreaming(sessionId, true)
    setSessionPaused(sessionId, false)
    streamTasksRef.current.set(sessionId, {
      assistantId,
      prompt,
      model,
      answerMode,
      baseContext: contextMessages,
    })
    setCanRegenerate(sessionId, true)

    // 关闭同会话旧流
    streamClosersRef.current.get(sessionId)?.()

    // 调用流式接口
    const close = streamChatReply({
      sessionId,
      prompt,
      model,
      knowledgeBaseId: activeKnowledgeBaseId,
      retrievalMode: answerMode,
      topK: 4,
      messages: contextMessages
        .filter(
          (item) =>
            (item.role === 'user' || item.role === 'assistant' || item.role === 'system') &&
            item.content.trim().length > 0,
        )
        .map((item) => ({
          role: item.role,
          content: item.content,
        })),
      token,
      // 接收流式片段
      onChunk: (chunk) => {
        if (assistantIdOverride) {
          appendToMessageById(sessionId, assistantId, chunk)
          return
        }
        addChunkMessage(sessionId, chunk)
      },
      // 接收引用来源
      onCitations: (citations) => {
        updateMessageById(sessionId, assistantId, (message) => ({
          ...message,
          citations,
        }))
      },
      // 流式完成
      onDone: () => {
        updateMessageById(sessionId, assistantId, (message) => ({
          ...message,
          status: 'done',
        }))

        const messages = useChatStore.getState().messagesBySession.get(sessionId) ?? []
        const assistant = messages.find((message) => message.id === assistantId)

        if (assistant?.content) {
          updateSessionPreview(sessionId, assistant.content.slice(0, 28))
        }

        setSessionStreaming(sessionId, false)
        setSessionPaused(sessionId, false)
        streamClosersRef.current.delete(sessionId)
      },
      // 错误处理
      onError: (errorMessage) => {
        updateMessageById(sessionId, assistantId, (message) => ({
          ...message,
          content:
            message.content.trim().length > 0
              ? `${message.content}\n\n[连接异常] ${errorMessage}`
              : `请求失败：${errorMessage}`,
          status: 'done',
        }))
        setSessionStreaming(sessionId, false)
        setSessionPaused(sessionId, false)
        streamClosersRef.current.delete(sessionId)
      },
    })

    streamClosersRef.current.set(sessionId, close)
  }

  // 暂停流式输出
  const handlePause = () => {
    if (!isStreaming) {
      return
    }

    const close = streamClosersRef.current.get(activeSessionId)
    if (!close) {
      return
    }

    close()
    streamClosersRef.current.delete(activeSessionId)
    setSessionStreaming(activeSessionId, false)
    setSessionPaused(activeSessionId, true)

    const task = streamTasksRef.current.get(activeSessionId)
    if (task) {
      updateMessageById(activeSessionId, task.assistantId, (message) => ({
        ...message,
        status: 'paused',
      }))
    }
  }

  // 继续流式输出
  const handleResume = () => {
    const task = streamTasksRef.current.get(activeSessionId)
    if (!task || !isPaused) {
      return
    }

    const messages = useChatStore.getState().messagesBySession.get(activeSessionId) ?? []
    const partial = messages.find((item) => item.id === task.assistantId)?.content ?? ''

    const resumePrompt = partial.trim()
      ? `请继续上一条回答，从“${partial.slice(-120)}”之后继续，不要重复已输出内容。`
      : task.prompt

    const resumeContext: ChatMessage[] = [
      ...task.baseContext,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: partial,
        createdAt: nowTimeLabel(),
        status: 'done',
      },
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: resumePrompt,
        createdAt: nowTimeLabel(),
        status: 'done',
      },
    ]

    startStreamReply(
      activeSessionId,
      resumePrompt,
      task.model,
      task.answerMode,
      resumeContext,
      task.assistantId,
    )
  }

  // 重新生成回答
  const handleRegenerate = () => {
    const task = streamTasksRef.current.get(activeSessionId)
    if (!task) {
      return
    }

    streamClosersRef.current.get(activeSessionId)?.()
    streamClosersRef.current.delete(activeSessionId)
    setSessionStreaming(activeSessionId, false)
    setSessionPaused(activeSessionId, false)
    removeMessageById(activeSessionId, task.assistantId)

    startStreamReply(
      activeSessionId,
      task.prompt,
      task.model,
      task.answerMode,
      task.baseContext,
    )
  }

  // 新建会话
  const handleNewSession = () => {
    const session = createSession('glm-4-flash')
    ensureSession(session.id)
    setMobileSidebarOpen(false)
  }

  // 重命名会话
  const handleRenameSession = (sessionId: string, title: string) => {
    renameSession(sessionId, title)
  }

  // 删除会话
  const handleDeleteSession = (sessionId: string) => {
    streamClosersRef.current.get(sessionId)?.()
    streamClosersRef.current.delete(sessionId)
    streamTasksRef.current.delete(sessionId)

    setCanRegenerate(sessionId, false)
    removeSessionData(sessionId)
    removeUploadsBySession(sessionId)
    deleteSession(sessionId)
  }

  // ====================== 文件上传处理 ======================
  const handlePickFile = (files: FileList) => {
    const fileList = Array.from(files)
    const queuedItems: UploadItem[] = fileList.map((file) => ({
      id: crypto.randomUUID(),
      sessionId: activeSessionId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'unknown',
      progress: 0,
      status: 'queued',
    }))

    addUploads(queuedItems)

    void Promise.allSettled(
      fileList.map(async (file, index) => {
        const uploadId = queuedItems[index]?.id
        if (!uploadId) {
          return
        }

        if (!isFileTypeAllowed(file)) {
          updateUpload(uploadId, {
            status: 'failed',
            error: '文件类型不支持，仅允许 txt/md/csv/json/log/pdf/docx。',
          })
          return
        }

        if (file.size > MAX_FILE_SIZE) {
          updateUpload(uploadId, {
            status: 'failed',
            error: `文件过大（${formatSize(file.size)}），上限 ${formatSize(MAX_FILE_SIZE)}。`,
          })
          return
        }

        updateUpload(uploadId, {
          status: 'uploading',
          progress: 15,
          error: undefined,
        })

        try {
          const parsed = await createAttachmentFromFile(file)

          updateUpload(uploadId, {
            status: 'done',
            progress: 100,
            body: parsed.body,
            note: parsed.note,
            mimeType: parsed.mimeType,
            error: undefined,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '上传失败'
          updateUpload(uploadId, {
            status: 'failed',
            error: message,
          })
        }
      }),
    )
  }

  // ====================== 发送消息 ======================
  const handleSend = () => {
    const prompt = inputValue.trim()
    const readyUploads = activeUploads.filter((item) => item.status === 'done')
    const attachmentsText = readyUploads
      .map((item, index) => {
        const body = String(item.body ?? '').trim()
        if (!body) {
          return ''
        }

        const noteLine = item.note ? `\n解析说明: ${item.note}` : ''
        return `【附件 ${index + 1}】\n文件名: ${item.name}\n文件大小: ${formatSize(item.size)}${noteLine}\n正文:\n${body}`
      })
      .filter(Boolean)
      .join('\n\n')

    if ((!prompt && !attachmentsText) || !activeSession || isStreaming || activeUploadsUploading) {
      return
    }

    const displayContent = prompt || '请结合我上传的附件内容回答。'
    const promptWithAttachments = attachmentsText
      ? `${displayContent}\n\n以下是我上传的附件解析内容，请结合它们回答：\n${attachmentsText}`
      : displayContent

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      createdAt: nowTimeLabel(),
      status: 'done',
    }

    // 插入用户消息
    pushMessage(activeSessionId, message)
    updateSessionPreview(activeSessionId, displayContent)
    setInputValue('')
    
    // 发送给 AI
    const modelContextMessages = [...activeMessages, { ...message, content: promptWithAttachments }]
    startStreamReply(
      activeSessionId,
      promptWithAttachments,
      activeSession.model,
      activeAnswerMode,
      modelContextMessages,
    )

    // 清空已发送附件
    readyUploads.forEach((item) => removeUpload(item.id))
  }

  // 清空当前会话消息
  const handleClearMessages = () => {
    clearSessionMessages(activeSessionId)
    streamTasksRef.current.delete(activeSessionId)
    setCanRegenerate(activeSessionId, false)
    updateSessionPreview(activeSessionId, '会话已清空')
  }

  // 导出对话记录（JSON）
  const handleExport = () => {
    const payload = JSON.stringify(activeMessages, null, 2)
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${activeSessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ====================== 页面渲染 ======================
  return (
    <div className="relative mx-auto flex h-screen w-full max-w-[1440px] overflow-hidden bg-slate-50 lg:p-4">
      {/* 移动端遮罩层 */}
      {mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-900/35 lg:hidden"
          aria-label="关闭侧边栏"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* 左侧会话侧边栏 */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* 主内容区 */}
      <section className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50 lg:ml-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
        {/* 顶部导航栏 */}
        <TopBar
          title={page === 'knowledge-base' ? '本地知识库管理' : (activeSession?.title ?? '新对话')}
          model={activeSession?.model ?? 'glm-4-flash'}
          themeMode={themeMode}
          isKnowledgeBasePage={page === 'knowledge-base'}
          isStreaming={isStreaming}
          isPaused={isPaused}
          canRegenerate={regenerateFlags[activeSessionId] ?? false}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onOpenKnowledgeBase={() => setPage('knowledge-base')}
          onBackToChat={() => setPage('chat')}
          onToggleTheme={toggleTheme}
          onPause={handlePause}
          onResume={handleResume}
          onRegenerate={handleRegenerate}
          onClear={handleClearMessages}
          onExport={handleExport}
        />

        {/* 页面内容：知识库 / 聊天 */}
        {page === 'knowledge-base' ? (
          <KnowledgeBasePage />
        ) : (
          <>
            {/* 消息列表（虚拟滚动） */}
            <div className="flex-1 overflow-hidden">
              <MessageList messages={activeMessages} />
            </div>

            {/* 聊天输入框 */}
            <ChatInput
              value={inputValue}
              answerMode={activeAnswerMode}
              onChange={setInputValue}
              onChangeAnswerMode={(mode) => {
                if (!activeSession) {
                  return
                }
                updateSessionAnswerMode(activeSession.id, mode)
              }}
              onSend={handleSend}
              onPickFile={handlePickFile}
              onRemoveUpload={removeUpload}
              uploads={activeUploads}
              disabled={isStreaming || activeUploadsUploading || inputValue.trim().length === 0}
            />
          </>
        )}
      </section>
    </div>
  )
}

export default App