
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types/chat'

/**
 * 聊天状态类型定义
 * 管理多会话聊天数据、流式加载、暂停状态等核心状态
 */
interface ChatState {
 // 按会话ID存储的消息列表（Map结构：key=sessionId, value=消息数组）
  messagesBySession: Map<string, ChatMessage[]>
  // 各会话的流式加载状态（key=sessionId, value=是否正在流式输出）
  sessionStreaming: Record<string, boolean>
  // 各会话的暂停状态（key=sessionId, value=是否暂停）
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
  removeSessionData: (sessionId: string) => void
  setSessionStreaming: (sessionId: string, streaming: boolean) => void
  setSessionPaused: (sessionId: string, paused: boolean) => void
}
/**
 * 聊天全局状态管理（Zustand + 持久化）
 * 持久化存储：仅保存消息数据，不保存流式/暂停等临时状态
 */
export const useChatStore = create(
  persist(
    (set: (fn: (state: ChatState) => Partial<ChatState>) => void) => ({
       // 初始化：消息Map、流式状态、暂停状态
      messagesBySession: new Map<string, ChatMessage[]>(),
      sessionStreaming: {},
      sessionPaused: {},
      /**
       * 确保会话存在
       * 使用 Map.has 检查，不存在则创建新的 Map 并设置空数组
       * 注意：必须创建新的 Map 实例以触发 React 重渲染
       */
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
      /**
       * 推送单条消息到指定会话
       * @param sessionId 会话ID
       * @param message 消息对象
       */
      pushMessage: (sessionId: string, message: ChatMessage) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = next.get(sessionId) ?? []
          next.set(sessionId, [...list, message])
          return { messagesBySession: next }
        })
      },
       /**
       * 向最后一条助手/系统消息追加内容块（流式输出）
       * 从后往前查找，找到第一条助手/系统消息并追加内容
       */
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
      /**
       * 清空指定会话的所有消息
       */
      clearSessionMessages: (sessionId: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          next.set(sessionId, [])
          return { messagesBySession: next }
        })
      },
      /**
       * 根据消息ID删除单条消息
       */
      removeMessageById: (sessionId: string, messageId: string) => {
        set((state: ChatState) => {
          const next = new Map(state.messagesBySession)
          const list = next.get(sessionId) ?? []
          const filtered = list.filter((message) => message.id !== messageId)
          next.set(sessionId, filtered)
          return { messagesBySession: next }
        })
      },
      /**
       * 根据消息ID追加内容块
       * 适用于精准定位某条消息进行流式追加
       */
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
      /**
       * 根据消息ID自定义更新消息
       * 支持传入更新函数灵活修改消息内容
       */
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
      /**
       * 彻底删除会话所有数据
       * 包含：消息列表、流式状态、暂停状态
       */
      removeSessionData: (sessionId: string) => {
        set((state: ChatState) => {
          const nextMessages = new Map(state.messagesBySession)
          nextMessages.delete(sessionId)

          const nextStreaming = { ...state.sessionStreaming }
          delete nextStreaming[sessionId]

          const nextPaused = { ...state.sessionPaused }
          delete nextPaused[sessionId]

          return {
            messagesBySession: nextMessages,
            sessionStreaming: nextStreaming,
            sessionPaused: nextPaused,
          }
        })
      },
      /**
       * 设置会话的流式加载状态
       */
      setSessionStreaming: (sessionId: string, streaming: boolean) => {
        set((state: ChatState) => ({
          sessionStreaming: {
            ...state.sessionStreaming,
            [sessionId]: streaming,
          },
        }))
      },
      /**
       * 设置会话的暂停状态
       */
      setSessionPaused: (sessionId: string, paused: boolean) => {
        set((state: ChatState) => ({
          sessionPaused: {
            ...state.sessionPaused,
            [sessionId]: paused,
          },
        }))
      },
    }),
     // 持久化配置
    {
      // 本地存储key名称
      name: 'chat-store',
      // 仅持久化消息数据，不持久化临时状态
      partialize: (state: ChatState) => ({
        messagesBySession: state.messagesBySession,
      }),
      // 自定义存储适配器（处理Map序列化/反序列化）
      storage: {
        /**
         * 从localStorage读取数据并反序列化为Map
         */
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const data = JSON.parse(str)
          // 将对象转回Map
          if (data.state && data.state.messagesBySession) {
            data.state.messagesBySession = new Map(
              Object.entries(data.state.messagesBySession)
            )
          }
          return data
        },

        /**
         * 将Map转为普通对象存入localStorage
         */
        setItem: (name, value) => {
          // 深拷贝避免污染原状态
          const cloned = JSON.parse(JSON.stringify(value))
          // Map 转普通对象
          if (value && value.state && value.state.messagesBySession instanceof Map) {
            cloned.state.messagesBySession = Object.fromEntries(value.state.messagesBySession)
          }
          localStorage.setItem(name, JSON.stringify(cloned))
        },

        // 删除存储数据
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
