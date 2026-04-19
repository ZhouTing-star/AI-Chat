// 导入知识库相关类型定义
import type { DocumentItem, KnowledgeBase, RetrievalMode, SearchResult } from '../types/knowledge'

/**
 * 后端接口错误返回格式定义
 */
interface ApiErrorPayload {
  error?: {
    message?: string // 错误提示信息
  }
}

/**
 * 构建完整的 API 请求地址
 * 优先级：环境变量 > 开发环境默认地址 > 当前域名
 */
function resolveApiUrl(path: string): URL {
  // 从环境变量获取基础接口地址
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined

  // 如果配置了基础地址，直接拼接
  if (apiBase) {
    return new URL(path, apiBase)
  }

  // 开发环境默认使用本地 45679 端口
  if (import.meta.env.DEV) {
    return new URL(path, 'http://127.0.0.1:45679')
  }

  // 生产环境使用当前网站域名
  return new URL(path, window.location.origin)
}

/**
 * 统一响应解析与异常抛出工具函数
 * 对响应做统一判断：失败则抛出错误，成功则返回 JSON 数据
 */
async function parseOrThrow<T>(response: Response): Promise<T> {
  // HTTP 状态码非 2xx 视为请求失败
  if (!response.ok) {
    let message = `请求失败，状态码 ${response.status}`
    try {
      // 尝试解析后端返回的错误信息
      const payload = (await response.json()) as ApiErrorPayload
      message = payload.error?.message ?? message
    } catch {
      // 解析失败则忽略，使用默认错误信息
    }
    // 抛出错误，由调用方 catch 处理
    throw new Error(message)
  }

  // 请求成功，返回 JSON 数据并指定类型
  return (await response.json()) as T
}

/**
 * 获取知识库列表
 */
export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const response = await fetch(resolveApiUrl('/api/rag/kbs').toString())
  return parseOrThrow<KnowledgeBase[]>(response)
}

/**
 * 创建新的知识库
 * @param name 知识库名称
 */
export async function createKnowledgeBase(name: string): Promise<KnowledgeBase> {
  const response = await fetch(resolveApiUrl('/api/rag/kbs').toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })

  return parseOrThrow<KnowledgeBase>(response)
}

/**
 * 获取指定知识库下的文档列表
 * @param kbId 知识库 ID
 */
export async function listKnowledgeBaseDocuments(kbId: string): Promise<DocumentItem[]> {
  const response = await fetch(resolveApiUrl(`/api/rag/kbs/${kbId}/documents`).toString())
  return parseOrThrow<DocumentItem[]>(response)
}

/**
 * 切换知识库启用/禁用状态
 * @param kbId 知识库 ID
 */
export async function toggleKnowledgeBaseActive(kbId: string): Promise<KnowledgeBase> {
  const response = await fetch(resolveApiUrl(`/api/rag/kbs/${kbId}/active`).toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseOrThrow<KnowledgeBase>(response)
}

/**
 * 切换文档启用/禁用状态
 * @param docId 文档 ID
 */
export async function toggleDocumentActive(docId: string): Promise<DocumentItem> {
  const response = await fetch(resolveApiUrl(`/api/rag/documents/${docId}/active`).toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseOrThrow<DocumentItem>(response)
}

/**
 * 删除知识库中的文档
 * @param docId 文档 ID
 */
export async function deleteKnowledgeDocument(docId: string): Promise<{ ok: boolean; documentId: string }> {
  const response = await fetch(resolveApiUrl(`/api/rag/documents/${docId}`).toString(), {
    method: 'DELETE',
  })

  return parseOrThrow<{ ok: boolean; documentId: string }>(response)
}

/**
 * 重建知识库搜索引擎（重新向量化、构建索引）
 * @param kbId 知识库 ID
 */
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

/**
 * 测试知识库检索效果
 * @param kbId 知识库 ID
 * @param query 检索问题
 * @param topK 返回条数
 * @param mode 检索模式
 */
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

/**
 * 上传文档到知识库（使用 XMLHttpRequest 支持上传进度）
 * @param kbId 知识库 ID
 * @param file 上传的文件
 * @param options 配置项，包含进度回调
 */
export async function uploadKnowledgeDocument(
  kbId: string,
  file: File,
  options?: {
    onProgress?: (progress: number) => void
  },
): Promise<{ documentId: string; chunks: number }> {
  const url = resolveApiUrl(`/api/rag/kbs/${kbId}/documents/upload`).toString()

  // 返回 Promise 便于外部 await 使用
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'json'

    // 监听上传进度
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }
      // 计算 0~100 进度
      const progress = Math.round((event.loaded / event.total) * 100)
      options?.onProgress?.(Math.max(0, Math.min(progress, 100)))
    }

    // 网络异常
    xhr.onerror = () => {
      reject(new Error('上传失败：网络异常。'))
    }

    // 请求完成
    xhr.onload = () => {
      const payload = xhr.response as ApiErrorPayload & { documentId?: string; chunks?: number }

      // 上传成功
      if (xhr.status >= 200 && xhr.status < 300 && payload?.documentId) {
        options?.onProgress?.(100)
        resolve({
          documentId: payload.documentId,
          chunks: Number(payload.chunks ?? 0),
        })
        return
      }

      // 上传失败
      const message = payload?.error?.message ?? `上传失败，状态码 ${xhr.status}`
      reject(new Error(message))
    }

    // 构造表单数据并发送
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}