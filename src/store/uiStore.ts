import { create } from 'zustand'
import type { UploadItem } from '../types/chat'

interface UIState {
  mobileSidebarOpen: boolean
  inputValue: string
  uploads: UploadItem[]
  setMobileSidebarOpen: (open: boolean) => void
  setInputValue: (value: string) => void
  addUploads: (uploads: UploadItem[]) => void
  updateUpload: (uploadId: string, patch: Partial<UploadItem>) => void
  removeUpload: (uploadId: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  mobileSidebarOpen: false,
  inputValue: '',
  uploads: [],
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
}))
