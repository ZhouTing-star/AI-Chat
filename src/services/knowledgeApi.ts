import type { DocumentItem, KnowledgeBase, RetrievalMode, SearchResult } from '../types/knowledge'

interface ApiErrorPayload {
  error?: {
    message?: string
  }
}

function resolveApiUrl(path: string): URL {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined

  if (apiBase) {
    return new URL(path, apiBase)
  }

  if (import.meta.env.DEV) {
    return new URL(path, 'http://127.0.0.1:45679')
  }

  return new URL(path, window.location.origin)
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `请求失败，状态码 ${response.status}`
    try {
      const payload = (await response.json()) as ApiErrorPayload
      message = payload.error?.message ?? message
    } catch {
      // ignore parse failure
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const response = await fetch(resolveApiUrl('/api/rag/kbs').toString())
  return parseOrThrow<KnowledgeBase[]>(response)
}

export async function listKnowledgeBaseDocuments(kbId: string): Promise<DocumentItem[]> {
  const response = await fetch(resolveApiUrl(`/api/rag/kbs/${kbId}/documents`).toString())
  return parseOrThrow<DocumentItem[]>(response)
}

export async function toggleKnowledgeBaseActive(kbId: string): Promise<KnowledgeBase> {
  const response = await fetch(resolveApiUrl(`/api/rag/kbs/${kbId}/active`).toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseOrThrow<KnowledgeBase>(response)
}

export async function toggleDocumentActive(docId: string): Promise<DocumentItem> {
  const response = await fetch(resolveApiUrl(`/api/rag/documents/${docId}/active`).toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseOrThrow<DocumentItem>(response)
}

export async function deleteKnowledgeDocument(docId: string): Promise<{ ok: boolean; documentId: string }> {
  const response = await fetch(resolveApiUrl(`/api/rag/documents/${docId}`).toString(), {
    method: 'DELETE',
  })

  return parseOrThrow<{ ok: boolean; documentId: string }>(response)
}

export async function rebuildSearchEngine(kbId: string): Promise<KnowledgeBase> {
  const response = await fetch(resolveApiUrl('/api/rag/rebuild').toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kbId }),
  })

  return parseOrThrow<KnowledgeBase>(response)
}

export async function testRetrieval(
  kbId: string,
  query: string,
  topK: number,
  mode: RetrievalMode,
): Promise<SearchResult[]> {
  const response = await fetch(resolveApiUrl('/api/rag/test-search').toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kbId, query, topK, mode }),
  })

  return parseOrThrow<SearchResult[]>(response)
}

export async function uploadKnowledgeDocument(
  kbId: string,
  file: File,
  options?: {
    onProgress?: (progress: number) => void
  },
): Promise<{ documentId: string; chunks: number }> {
  const url = resolveApiUrl(`/api/rag/kbs/${kbId}/documents/upload`).toString()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }
      const progress = Math.round((event.loaded / event.total) * 100)
      options?.onProgress?.(Math.max(0, Math.min(progress, 100)))
    }

    xhr.onerror = () => {
      reject(new Error('上传失败：网络异常。'))
    }

    xhr.onload = () => {
      const payload = xhr.response as ApiErrorPayload & { documentId?: string; chunks?: number }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.documentId) {
        options?.onProgress?.(100)
        resolve({
          documentId: payload.documentId,
          chunks: Number(payload.chunks ?? 0),
        })
        return
      }

      const message = payload?.error?.message ?? `上传失败，状态码 ${xhr.status}`
      reject(new Error(message))
    }

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
