import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockSessions } from '../mocks/chatData'
import type { ChatSession } from '../types/chat'

interface SessionState {
  sessions: ChatSession[]
  activeSessionId: string
  setActiveSessionId: (sessionId: string) => void
  createSession: (model?: string) => ChatSession
  updateSessionPreview: (sessionId: string, preview: string) => void
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export const useSessionStore = create(
  persist(
    (set: (fn: (state: SessionState) => Partial<SessionState>) => void) => ({
      sessions: mockSessions,
      activeSessionId: mockSessions[0]?.id ?? '',
      setActiveSessionId: (sessionId: string) => set(() => ({ activeSessionId: sessionId })),
      createSession: (model = 'glm-4-flash') => {
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: '新对话',
          updatedAt: nowTimeLabel(),
          preview: '开始新的提问。',
          model,
        }
        set((state: SessionState) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        }))
        return session
      },
      updateSessionPreview: (sessionId: string, preview: string) => {
        set((state: SessionState) => ({
          sessions: state.sessions.map((session: ChatSession) =>
            session.id === sessionId
              ? {
                  ...session,
                  preview,
                  updatedAt: nowTimeLabel(),
                }
              : session,
          ),
        }))
      },
    }),
    {
      name: 'session-store',
      partialize: (state: SessionState) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
)
