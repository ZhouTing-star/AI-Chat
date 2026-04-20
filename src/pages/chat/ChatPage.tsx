import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatInput } from './components/ChatInput'
import { MessageList } from './components/MessageList'
import { AppShell } from '../../components/layout/AppShell'
import { Sidebar } from '../../components/layout/Sidebar'
import { TopBar } from '../../components/layout/TopBar'
import { useSessionSidebar } from '../../hooks/useSessionSidebar'
import { streamChatReply } from '../../services/chatStream'
import { useChatStore } from '../../store/chatStore'
import { useThemeStore } from '../../store/themeStore'
import { useUIStore } from '../../store/uiStore'
import type { AnswerMode, ChatMessage, UploadItem } from '../../types/chat'
import {
  createAttachmentFromFile,
  formatSize,
  isFileTypeAllowed,
  MAX_FILE_SIZE,
} from '../../utils/attachmentParser'

interface StreamTaskMeta {
  assistantId: string
  prompt: string
  model: string
  answerMode: AnswerMode
  baseContext: ChatMessage[]
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function ChatPage() {
  const streamClosersRef = useRef<Map<string, () => void>>(new Map())
  const streamTasksRef = useRef<Map<string, StreamTaskMeta>>(new Map())
  const [regenerateFlags, setRegenerateFlags] = useState<Record<string, boolean>>({})
  const setCanRegenerate = (sessionId: string, canRegenerate: boolean) => {
    setRegenerateFlags((prev) => ({
      ...prev,
      [sessionId]: canRegenerate,
    }))
  }

  const {
    sessions,
    activeSession,
    activeSessionId,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    setActiveSessionId,
    updateSessionPreview,
    updateSessionAnswerMode,
    handleNewSession,
    handleRenameSession,
    handleDeleteSession,
  } = useSessionSidebar({
    onBeforeDelete: (sessionId) => {
      streamClosersRef.current.get(sessionId)?.()
      streamClosersRef.current.delete(sessionId)
      streamTasksRef.current.delete(sessionId)
      setCanRegenerate(sessionId, false)
    },
  })

  const messagesBySession = useChatStore((state) => state.messagesBySession)
  const pushMessage = useChatStore((state) => state.pushMessage)
  const addChunkMessage = useChatStore((state) => state.addChunkMessage)
  const clearSessionMessages = useChatStore((state) => state.clearSessionMessages)
  const removeMessageById = useChatStore((state) => state.removeMessageById)
  const appendToMessageById = useChatStore((state) => state.appendToMessageById)
  const updateMessageById = useChatStore((state) => state.updateMessageById)
  const setSessionStreaming = useChatStore((state) => state.setSessionStreaming)
  const setSessionPaused = useChatStore((state) => state.setSessionPaused)
  const isStreaming = useChatStore(
    (state) => state.sessionStreaming[activeSessionId] ?? false,
  )
  const isPaused = useChatStore((state) => state.sessionPaused[activeSessionId] ?? false)

  const themeMode = useThemeStore((state) => state.mode)
  const toggleTheme = useThemeStore((state) => state.toggleMode)

  const page = useUIStore((state) => state.page)
  const activeKnowledgeBaseId = useUIStore((state) => state.activeKnowledgeBaseId)
  const inputValue = useUIStore((state) => state.inputValue)
  const uploads = useUIStore((state) => state.uploads)
  const setPage = useUIStore((state) => state.setPage)
  const setInputValue = useUIStore((state) => state.setInputValue)
  const addUploads = useUIStore((state) => state.addUploads)
  const updateUpload = useUIStore((state) => state.updateUpload)
  const removeUpload = useUIStore((state) => state.removeUpload)

  const activeMessages = messagesBySession.get(activeSessionId) ?? []
  const activeUploads = useMemo(
    () => uploads.filter((item) => item.sessionId === activeSessionId),
    [uploads, activeSessionId],
  )
  const activeUploadsUploading = useMemo(
    () => activeUploads.some((item) => item.status === 'queued' || item.status === 'uploading'),
    [activeUploads],
  )
  const activeAnswerMode: AnswerMode = activeSession?.answerMode ?? 'balanced'

  useEffect(() => {
    const streamClosers = streamClosersRef.current

    return () => {
      streamClosers.forEach((close) => close())
      streamClosers.clear()
    }
  }, [])

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

    if (assistantIdOverride) {
      updateMessageById(sessionId, assistantId, (message) => ({
        ...message,
        status: 'streaming',
      }))
    } else {
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

    streamClosersRef.current.get(sessionId)?.()

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
      onChunk: (chunk) => {
        if (assistantIdOverride) {
          appendToMessageById(sessionId, assistantId, chunk)
          return
        }
        addChunkMessage(sessionId, chunk)
      },
      onCitations: (citations) => {
        updateMessageById(sessionId, assistantId, (message) => ({
          ...message,
          citations,
        }))
      },
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

    pushMessage(activeSessionId, message)
    updateSessionPreview(activeSessionId, displayContent)
    setInputValue('')

    const modelContextMessages = [...activeMessages, { ...message, content: promptWithAttachments }]
    startStreamReply(
      activeSessionId,
      promptWithAttachments,
      activeSession.model,
      activeAnswerMode,
      modelContextMessages,
    )

    readyUploads.forEach((item) => removeUpload(item.id))
  }

  const handleClearMessages = () => {
    clearSessionMessages(activeSessionId)
    streamTasksRef.current.delete(activeSessionId)
    setCanRegenerate(activeSessionId, false)
    updateSessionPreview(activeSessionId, '会话已清空')
  }

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

  return (
    <AppShell
      mobileSidebarOpen={mobileSidebarOpen}
      onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
      sidebar={
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
      }
      header={
        <TopBar
          title={activeSession?.title ?? '新对话'}
          model={activeSession?.model ?? 'glm-4-flash'}
          themeMode={themeMode}
          isKnowledgeBasePage={page === 'knowledge-base'}
          isStreaming={isStreaming}
          isPaused={isPaused}
          canRegenerate={regenerateFlags[activeSessionId] ?? false}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onOpenKnowledgeBase={() => setPage('knowledge-base')}
          onToggleTheme={toggleTheme}
          onPause={handlePause}
          onResume={handleResume}
          onRegenerate={handleRegenerate}
          onClear={handleClearMessages}
          onExport={handleExport}
        />
      }
    >
      <>
        <div className="flex-1 overflow-hidden">
          <MessageList messages={activeMessages} />
        </div>
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
    </AppShell>
  )
}
