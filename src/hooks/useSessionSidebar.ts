import { useEffect, useMemo } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSessionStore } from '../store/sessionStore'
import { useUIStore } from '../store/uiStore'

interface UseSessionSidebarOptions {
  onBeforeDelete?: (sessionId: string) => void
}

export function useSessionSidebar(options: UseSessionSidebarOptions = {}) {
  const { onBeforeDelete } = options

  const sessions = useSessionStore((state) => state.sessions)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const setActiveSessionId = useSessionStore((state) => state.setActiveSessionId)
  const createSession = useSessionStore((state) => state.createSession)
  const renameSession = useSessionStore((state) => state.renameSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const updateSessionPreview = useSessionStore((state) => state.updateSessionPreview)
  const updateSessionAnswerMode = useSessionStore((state) => state.updateSessionAnswerMode)

  const ensureSession = useChatStore((state) => state.ensureSession)
  const removeSessionData = useChatStore((state) => state.removeSessionData)

  const mobileSidebarOpen = useUIStore((state) => state.mobileSidebarOpen)
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen)
  const removeUploadsBySession = useUIStore((state) => state.removeUploadsBySession)

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null
  }, [activeSessionId, sessions])

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

  const handleNewSession = () => {
    const session = createSession('glm-4-flash')
    ensureSession(session.id)
    setMobileSidebarOpen(false)
  }

  const handleRenameSession = (sessionId: string, title: string) => {
    renameSession(sessionId, title)
  }

  const handleDeleteSession = (sessionId: string) => {
    onBeforeDelete?.(sessionId)
    removeSessionData(sessionId)
    removeUploadsBySession(sessionId)
    deleteSession(sessionId)
  }

  return {
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
  }
}
