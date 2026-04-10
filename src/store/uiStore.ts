import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UploadItem } from '../types/chat'
import type { RetrievalMode } from '../types/knowledge'

export type AppPage = 'chat' | 'knowledge-base'

interface UIState {
  page: AppPage
  activeKnowledgeBaseId: string
  retrievalMode: RetrievalMode
  mobileSidebarOpen: boolean
  inputValue: string
  uploads: UploadItem[]
  setPage: (page: AppPage) => void
  setActiveKnowledgeBaseId: (kbId: string) => void
  setRetrievalMode: (mode: RetrievalMode) => void
  setMobileSidebarOpen: (open: boolean) => void
  setInputValue: (value: string) => void
  addUploads: (uploads: UploadItem[]) => void
  updateUpload: (uploadId: string, patch: Partial<UploadItem>) => void
  removeUpload: (uploadId: string) => void
  removeUploadsBySession: (sessionId: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      page: 'chat',
      activeKnowledgeBaseId: 'kb-default',
      retrievalMode: 'hybrid',
      mobileSidebarOpen: false,
      inputValue: '',
      uploads: [],
      setPage: (page) => set({ page }),
      setActiveKnowledgeBaseId: (kbId) => set({ activeKnowledgeBaseId: kbId }),
      setRetrievalMode: (mode) => set({ retrievalMode: mode }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setInputValue: (value) => set({ inputValue: value }),
      addUploads: (uploads) => {
        set((state) => ({
          uploads: [...state.uploads, ...uploads],
        }))
      },
      updateUpload: (uploadId, patch) => {
        set((state) => ({
          uploads: state.uploads.map((upload) =>
            upload.id === uploadId
              ? {
                  ...upload,
                  ...patch,
                }
              : upload,
          ),
        }))
      },
      removeUpload: (uploadId) => {
        set((state) => ({
          uploads: state.uploads.filter((upload) => upload.id !== uploadId),
        }))
      },
      removeUploadsBySession: (sessionId) => {
        set((state) => ({
          uploads: state.uploads.filter((upload) => upload.sessionId !== sessionId),
        }))
      },
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        page: state.page,
        activeKnowledgeBaseId: state.activeKnowledgeBaseId,
        retrievalMode: state.retrievalMode,
      }),
    },
  ),
)
