import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UploadItem } from '../types/chat'
import type { RetrievalMode } from '../types/knowledge'

// ============================================
// 应用页面类型定义
// 'chat' - 主聊天界面
// 'knowledge-base' - 知识库管理界面
// ============================================
export type AppPage = 'chat' | 'knowledge-base'

// ============================================
// 类型定义：UI 状态结构
// ============================================
interface UIState {
  // ------------------- 导航与视图状态 -------------------
  
  /** 当前显示的页面：聊天页或知识库页 */
  page: AppPage
  
  /** 当前选中的知识库 ID（用于关联检索） */
  activeKnowledgeBaseId: string
  
  /** 检索模式：语义检索、关键词检索或混合检索 */
  retrievalMode: RetrievalMode

  // ------------------- 交互状态 -------------------
  
  /** 移动端侧边栏是否展开（响应式布局用） */
  mobileSidebarOpen: boolean
  
  /** 输入框当前值（受控组件状态） */
  inputValue: string
  
  /** 当前会话的文件上传列表（待发送或已发送的文件） */
  uploads: UploadItem[]

  // ------------------- Setter 方法 -------------------
  
  /** 切换当前页面（聊天 ↔ 知识库） */
  setPage: (page: AppPage) => void
  
  /** 设置当前激活的知识库 ID */
  setActiveKnowledgeBaseId: (kbId: string) => void
  
  /** 切换检索模式 */
  setRetrievalMode: (mode: RetrievalMode) => void
  
  /** 控制移动端侧边栏展开/收起 */
  setMobileSidebarOpen: (open: boolean) => void
  
  /** 更新输入框内容 */
  setInputValue: (value: string) => void
  
  /** 批量添加上传文件到列表 */
  addUploads: (uploads: UploadItem[]) => void
  
  /** 更新指定上传文件的元数据（如进度、状态） */
  updateUpload: (uploadId: string, patch: Partial<UploadItem>) => void
  
  /** 删除单个上传文件 */
  removeUpload: (uploadId: string) => void
  
  /** 清空指定会话关联的所有上传文件（切换会话时清理） */
  removeUploadsBySession: (sessionId: string) => void
}

// ============================================
// 创建 Store，使用 persist 实现部分状态持久化
// ============================================
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // 初始状态值
      page: 'chat',                // 默认显示聊天页
      activeKnowledgeBaseId: '',   // 默认未选中知识库
      retrievalMode: 'hybrid',     // 默认混合检索模式
      mobileSidebarOpen: false,    // 移动端侧边栏默认收起
      inputValue: '',              // 输入框初始为空
      uploads: [],                 // 上传列表初始为空

      // ------------------- 简单 Setter（直接替换值）-------------------
      
      setPage: (page) => set({ page }),
      setActiveKnowledgeBaseId: (kbId) => set({ activeKnowledgeBaseId: kbId }),
      setRetrievalMode: (mode) => set({ retrievalMode: mode }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setInputValue: (value) => set({ inputValue: value }),

      // ------------------- 上传文件管理（基于原状态计算）-------------------
      
      /**
       * 批量添加上传项
       * 使用展开运算符合并新上传项到现有列表尾部
       */
      addUploads: (uploads) => {
        set((state) => ({
          uploads: [...state.uploads, ...uploads],
        }))
      },

      /**
       * 更新指定上传项
       * 通过 map 遍历找到目标项，使用对象展开合并 patch 的更新字段
       * 适用于更新上传进度、状态、错误信息等部分字段
       */
      updateUpload: (uploadId, patch) => {
        set((state) => ({
          uploads: state.uploads.map((upload) =>
            upload.id === uploadId
              ? {
                  ...upload,    // 保留原有字段
                  ...patch,     // 覆盖更新的字段
                }
              : upload
          ),
        }))
      },

      /**
       * 删除单个上传项
       * 使用 filter 排除指定 ID 的项
       */
      removeUpload: (uploadId) => {
        set((state) => ({
          uploads: state.uploads.filter((upload) => upload.id !== uploadId),
        }))
      },

      /**
       * 按会话 ID 批量删除上传项
       * 用于切换会话时清理旧会话的附件，或会话删除时的联动清理
       */
      removeUploadsBySession: (sessionId) => {
        set((state) => ({
          uploads: state.uploads.filter((upload) => upload.sessionId !== sessionId),
        }))
      },
    }),
    
    // ============================================
    // Persist 配置：选择性持久化
    // ============================================
    {
      name: 'ui-store', // localStorage 存储键名
      
      /**
       * partialize：只持久化部分配置型状态，不持久化临时状态
       * 
       * 持久化（刷新保留）：
       * - page: 记住用户最后是在聊天页还是知识库页
       * - activeKnowledgeBaseId: 记住用户选中的知识库
       * - retrievalMode: 记住用户的检索偏好
       * 
       * 不持久化（刷新重置）：
       * - mobileSidebarOpen: 移动端侧边栏状态刷新后应重置为关闭
       * - inputValue: 输入框内容刷新后应清空，避免脏数据
       * - uploads: 上传文件列表刷新后重置（实际文件可能已过期）
       */
      partialize: (state) => ({
        page: state.page,
        activeKnowledgeBaseId: state.activeKnowledgeBaseId,
        retrievalMode: state.retrievalMode,
      }),
    },
  ),
)