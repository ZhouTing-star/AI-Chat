export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'done' | 'streaming'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  status?: MessageStatus
}

export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  preview: string
  model: string
}

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed'

export interface UploadItem {
  id: string
  name: string
  size: number
  progress: number
  status: UploadStatus
}
