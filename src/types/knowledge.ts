export interface KnowledgeBase {
  id: string
  name: string
  status: string
  docs: number
  chunks: number
  updatedAt: string
  storageUsed: string
  storageTotal: string
  embeddingModel: string
  embeddingDims: number
  indexJobs: number
  isActive: boolean
  engineVersion: number
  lastRebuildAt: string
}

export interface DocumentItem {
  id: string
  kbId: string
  name: string
  size: string
  chunks: number
  updatedAt: string
  isActive: boolean
}

export interface SearchResult {
  id: string
  kbId: string
  docId: string
  source: string
  content: string
  score: number
}

export type RetrievalMode = 'hybrid' | 'vector' | 'off'
