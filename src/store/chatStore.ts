
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockMessagesBySession } from '../mocks/chatData'
import type { ChatMessage } from '../types/chat'

interface ChatState {
  messagesBySession: Map<string, ChatMessage[]>
  sessionStreaming: Record<string, boolean>
  sessionPaused: Record<string, boolean>
  ensureSession: (sessionId: string) => void
  pushMessage: (sessionId: string, message: ChatMessage) => void
  addChunkMessage: (sessionId: string, chunk: string) => void
  clearSessionMessages: (sessionId: string) => void
  removeMessageById: (sessionId: string, messageId: string) => void
  appendToMessageById: (sessionId: string, messageId: string, chunk: string) => void
  updateMessageById: (
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void
  setSessionStreaming: (sessionId: string, streaming: boolean) => void
  setSessionPaused: (sessionId: string, paused: boolean) => void
}

export const useChatStore = create(
  persist(
    (set: (fn: (state: ChatState) => Partial<ChatState>) => void) => ({
      messagesBySession: new Map<string, ChatMessage[]>(Object.entries(mockMessagesBySession)),
      sessionStreaming: {},
      sessionPaused: {},
      ensureSession: (sessionId: string) => {
        set((state: ChatState) => {
          if (state.messagesBySession.has(sessionId)) {
            return state
          }
          const next = new Map(state.messagesBySession)
          next.set(sessionId, [])
          return { messagesBySession: next }
        })
      },
      pushMessage: (sessionId: string, message: ChatMessage) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = next.get(sessionId) ?? []
          next.set(sessionId, [...list, message])
          return { messagesBySession: next }
        })
      },
      addChunkMessage: (sessionId: string, chunk: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = [...(next.get(sessionId) ?? [])]
          for (let i = list.length - 1; i >= 0; i -= 1) {
            const item = list[i]
            if (item.role === 'assistant' || item.role === 'system') {
              list[i] = {
                ...item,
                content: `${item.content}${chunk}`,
              }
              next.set(sessionId, list)
              return { messagesBySession: next }
            }
          }
          return state
        })
      },
      clearSessionMessages: (sessionId: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          next.set(sessionId, [])
          return { messagesBySession: next }
        })
      },
      removeMessageById: (sessionId: string, messageId: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = next.get(sessionId) ?? []
          const filtered = list.filter((message) => message.id !== messageId)
          next.set(sessionId, filtered)
          return { messagesBySession: next }
        })
      },
      appendToMessageById: (sessionId: string, messageId: string, chunk: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = [...(next.get(sessionId) ?? [])]
          const index = list.findIndex((message) => message.id === messageId)
          if (index === -1) {
            return state
          }
          list[index] = {
            ...list[index],
            content: `${list[index].content}${chunk}`,
          }
          next.set(sessionId, list)
          return { messagesBySession: next }
        })
      },
      updateMessageById: (sessionId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = [...(next.get(sessionId) ?? [])]
          const index = list.findIndex((message) => message.id === messageId)
          if (index === -1) {
            return state
          }
          list[index] = updater(list[index])
          next.set(sessionId, list)
          return { messagesBySession: next }
        })
      },
      setSessionStreaming: (sessionId: string, streaming: boolean) => {
        set((state: ChatState) => ({
          sessionStreaming: {
            ...state.sessionStreaming,
            [sessionId]: streaming,
          },
        }))
      },
      setSessionPaused: (sessionId: string, paused: boolean) => {
        set((state: ChatState) => ({
          sessionPaused: {
            ...state.sessionPaused,
            [sessionId]: paused,
          },
        }))
      },
    }),
    {
      name: 'chat-store',
      partialize: (state: ChatState) => ({
        messagesBySession: state.messagesBySession,
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const data = JSON.parse(str)
          if (data.state && data.state.messagesBySession) {
            // 反序列化为 Map
            data.state.messagesBySession = new Map(
              Object.entries(data.state.messagesBySession)
            )
          }
          return data
        },
        setItem: (name, value) => {
          // Map 转对象，clone 一份，避免污染原 state
          const cloned = JSON.parse(JSON.stringify(value))
          if (value && value.state && value.state.messagesBySession instanceof Map) {
            cloned.state.messagesBySession = Object.fromEntries(value.state.messagesBySession)
          }
          localStorage.setItem(name, JSON.stringify(cloned))
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
