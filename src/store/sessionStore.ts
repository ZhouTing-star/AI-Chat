import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatSession } from '../types/chat'

/**
 * 会话状态类型定义
 * 管理聊天会话列表、当前激活会话、会话增删改查等操作
 */
interface SessionState {
  // 会话列表数组
  sessions: ChatSession[]
  // 当前激活的会话 ID
  activeSessionId: string
  setActiveSessionId: (sessionId: string) => void
  createSession: (model?: string) => ChatSession
  renameSession: (sessionId: string, title: string) => void
  deleteSession: (sessionId: string) => void
  updateSessionPreview: (sessionId: string, preview: string) => void
  updateSessionAnswerMode: (sessionId: string, answerMode: ChatSession['answerMode']) => void
}

/**
 * 获取当前时间格式化字符串（HH:MM）
 * 用于会话列表的更新时间展示
 */
function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * 会话全局状态管理（Zustand + 本地持久化）
 * 负责：会话列表、激活会话、会话增删改查
 */
export const useSessionStore = create(
  persist(
    (set: (fn: (state: SessionState) => Partial<SessionState>) => void) => ({
       // 初始化：空会话列表
      sessions: [],
      // 初始化：无激活会话
      activeSessionId: '',

      /**
       * 设置当前激活会话 ID
       */
      setActiveSessionId: (sessionId: string) => set(() => ({ activeSessionId: sessionId })),
      /**
       * 创建新会话
       * @param model 对话模型，默认 glm-4-flash
       * @returns 新创建的会话对象
       */
      createSession: (model = 'glm-4-flash') => {
        // 生成新会话结构
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: '新对话',
          updatedAt: nowTimeLabel(),
          preview: '开始新的提问。',
          model,
          answerMode: 'balanced',
        }
        // 新会话插入到列表最前面，并设为当前激活会话
        set((state: SessionState) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        }))
        return session
      },
      /**
       * 重命名会话
       * @param sessionId 目标会话 ID
       * @param title 新标题
       */
      renameSession: (sessionId: string, title: string) => {
        const nextTitle = title.trim()
        if (!nextTitle) {
          return
        }

        set((state: SessionState) => ({
          sessions: state.sessions.map((session: ChatSession) =>
            session.id === sessionId
              ? {
                  ...session,
                  title: nextTitle,
                  updatedAt: nowTimeLabel(),
                }
              : session,
          ),
        }))
      },
      /**
       * 删除会话
       * 若删除的是当前激活会话，则自动切换到第一个会话
       */
      deleteSession: (sessionId: string) => {
        set((state: SessionState) => {
          const nextSessions = state.sessions.filter((session: ChatSession) => session.id !== sessionId)
          const nextActiveSessionId =
            state.activeSessionId === sessionId
              ? nextSessions[0]?.id ?? ''
              : state.activeSessionId

          return {
            sessions: nextSessions,
            activeSessionId: nextActiveSessionId,
          }
        })
      },
      /**
       * 更新会话预览文字（会话列表展示的简短内容）
       */
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
      /**
       * 更新会话的回答模式
       */
      updateSessionAnswerMode: (sessionId: string, answerMode: ChatSession['answerMode']) => {
        set((state: SessionState) => ({
          sessions: state.sessions.map((session: ChatSession) =>
            session.id === sessionId
              ? {
                  ...session,
                  answerMode,
                  updatedAt: nowTimeLabel(),
                }
              : session,
          ),
        }))
      },
    }),
    // ============================================
    // Persist 配置：本地存储与数据迁移
    // ============================================
    {
      name: 'session-store', // localStorage 的 key 名称
      
      /**
       * merge 函数：处理持久化数据与当前状态的合并
       * 主要用于数据版本迁移和默认值填充
       * 
       * 场景：当应用更新添加了新字段（如 answerMode），旧数据中没有该字段，
       * 通过 merge 可以为旧数据填充默认值，避免 undefined 错误
       */
      merge: (persistedState: unknown, currentState: SessionState): SessionState => {
        const typed = (persistedState ?? {}) as Partial<SessionState>
        
        // 数据迁移：确保每个会话都有 answerMode 字段（兼容旧数据）
        // 如果旧数据中没有 answerMode，默认设为 'balanced'
        const sessions = Array.isArray(typed.sessions)
          ? typed.sessions.map((session) => ({
              ...session,
              answerMode: session.answerMode ?? 'balanced',
            }))
          : currentState.sessions

        return {
          ...currentState,           // 保留当前状态的默认值
          ...typed,                  // 覆盖持久化的数据
          sessions,                  // 使用处理后的会话列表（填充缺失字段）
          activeSessionId: typed.activeSessionId ?? currentState.activeSessionId,
        }
      },
      
      /**
       * partialize：选择性持久化
       * 只保存 sessions 和 activeSessionId，不保存方法函数
       * 函数不需要持久化，因为它们是代码定义的
       */
      partialize: (state: SessionState) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
)
