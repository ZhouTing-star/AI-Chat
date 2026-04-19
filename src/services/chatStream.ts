import type { MessageCitation } from '../types/chat'

/**
 * 后端流式返回的消息载体结构
 */
interface StreamPayload {
  delta?: string // 流式增量内容
  content?: string // 完整内容
  text?: string // 文本内容（兼容字段）
  done?: boolean // 是否结束
  citations?: MessageCitation[] // 引用片段
  event?: string // 事件类型
  error?: string | { message?: string } // 错误信息
}

/**
 * 上下文消息结构（传给后端的对话历史）
 */
interface StreamContextMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * 流式对话请求参数配置
 */
interface StreamChatOptions {
  sessionId: string // 会话ID
  prompt: string // 用户问题
  model: string // 使用的模型
  knowledgeBaseId?: string // 知识库ID
  retrievalMode?: 'strict' | 'balanced' | 'general' | 'hybrid' | 'vector' | 'off' // 检索模式
  topK?: number // 检索召回数量
  attachmentDocIds?: string[] // 附件文档ID
  messages?: StreamContextMessage[] // 对话上下文
  token?: string // 身份令牌

  onChunk: (chunk: string) => void // 收到文本片段回调
  onCitations?: (citations: MessageCitation[]) => void // 收到引用片段回调
  onDone: () => void // 流式结束回调
  onError: (error: string) => void // 错误回调
}


/**
 * 构建 API 请求地址
 * 优先使用环境变量，否则开发环境默认本地 45679 端口
 */
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

/**
 * 解析后端返回的 SSE 数据
 * 兼容 JSON / 纯文本 / [DONE] 结束标记
 */
/**
 * 解析后端返回的 SSE 数据
 * 兼容 JSON / 纯文本 / [DONE] 结束标记
 */
function parseData(data: string): {
  chunk?: string
  done?: boolean
  error?: string
  citations?: MessageCitation[]
} {
  const trimmed = data.trim()

  // 空数据不处理
  if (!trimmed) {
    return {}
  }

  // 结束标记
  if (trimmed === '[DONE]') {
    return { done: true }
  }

  try {
    const payload = JSON.parse(trimmed) as StreamPayload
    // 统一错误格式
    const error =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message

    if (error) {
      return { error }
    }

    // 兼容多种内容字段
    const chunk = payload.delta ?? payload.content ?? payload.text
    const done = payload.done || payload.event === 'done'

    // 有引用则返回引用
    if (Array.isArray(payload.citations) && payload.citations.length > 0) {
      return { citations: payload.citations, done }
    }

    return { chunk, done }
  } catch {
    // 解析失败则直接返回原文
    return { chunk: trimmed }
  }
}
// ============================================
// 核心函数：流式聊天请求
// ============================================

/**
 * 发起 SSE 流式聊天请求
 * 
 * 功能特性：
 * - 支持 abort 取消请求（返回的 close 函数）
 * - 自动处理事件流解析（event: 和 data: 行）
 * - 支持 RAG 引用回调
 * - 完整的错误处理（网络错误、HTTP 错误、业务错误）
 * 
 * @param options - 请求配置和回调函数
 * @returns 关闭/取消函数，调用可中断流
 */
export function streamChatReply(options: StreamChatOptions): () => void {
  const {
    sessionId,
    prompt,
    model,
    knowledgeBaseId,
    retrievalMode,
    topK,
    attachmentDocIds = [],
    messages = [],
    token,
    onChunk,
    onCitations,
    onDone,
    onError,
  } = options

  const url = resolveApiUrl('/api/chat/stream')

  // 从环境变量读取认证头配置（适配不同后端规范）
  const tokenHeader = (import.meta.env.VITE_API_TOKEN_HEADER as string | undefined) ?? 'Authorization'
  const tokenPrefix = (import.meta.env.VITE_API_TOKEN_PREFIX as string | undefined) ?? 'Bearer'
  
  const headers: Record<string, string> = {
    Accept: 'text/event-stream', // 声明接受 SSE 格式
    'Content-Type': 'application/json',
  }

  if (token) {
    headers[tokenHeader] = `${tokenPrefix} ${token}`
  }

  // ------------------- 流控制状态 -------------------
  
  const controller = new AbortController()
  let doneNotified = false  // 防止重复调用 onDone
  let closed = false        // 标记流是否已关闭

   /**
   * 安全关闭函数：确保资源释放和状态标记
   */
  const close = () => {
    if (closed) {
      return
    }
    closed = true
    controller.abort() // 取消 fetch 请求
  }

  /**
   * 安全完成通知：确保只调用一次 onDone
   */
  const notifyDone = () => {
    if (doneNotified) {
      return
    }
    doneNotified = true
    onDone()
  }

    // ------------------- SSE 消息处理 -------------------

  /**
   * 处理单个 SSE 事件块（可能包含多行：event: 和 data:）
   * 
   * SSE 格式示例：
   *   event: message
   *   data: {"delta": "你好", "done": false}
   *   
   *   event: citations
   *   data: {"citations": [...]}
   *   
   *   event: done
   *   data: {}
   */
  const processEventChunk = (rawChunk: string) => {
    const lines = rawChunk.split(/\r?\n/)
    let eventName = 'message'// 默认事件类型
    const dataLines: string[] = []

     // 解析 SSE 协议行
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) {
      return
    }

     // 处理特殊事件类型
    if (eventName === 'done') {
      notifyDone()
      close()
      return
    }

    // 解析 data 内容并分发回调
    const result = parseData(dataLines.join('\n'))
    if (result.error) {
      onError(result.error)
      close()
      return
    }


    if (result.chunk) {
      onChunk(result.chunk)
    }
    // RAG 引用来源处理
    if (Array.isArray(result.citations) && result.citations.length > 0) {
      onCitations?.(result.citations)
    }

    if (result.done) {
      notifyDone()
      close()
    }
  }

  /**
   * 启动流式请求
   */
  const start = async () => {
    try {
      // 发送 POST 请求
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId,
          prompt,
          model,
          knowledgeBaseId,
          retrievalMode,
          topK,
          attachmentDocIds,
          messages,
        }),
        signal: controller.signal, // 绑定中断信号
      })

      // HTTP 状态异常
      if (!response.ok) {
        let message = `请求失败，状态码 ${response.status}`
        try {
          const text = await response.text()
          if (text.trim()) message = text
        } catch {
          // 忽略 body 解析错误，使用默认状态码提示
        }
        onError(message)
        close()
        return
      }

      // 无响应体
      if (!response.body) {
        onError('SSE 响应体为空。')
        close()
        return
      }

      // 读取流式数据
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = '' // 数据缓冲（解决粘包）

      while (!closed) {
        const { value, done } = await reader.read()
        if (done) {
          if (!closed) notifyDone()
          close()
          break
        }

        // 解码并拼接到缓冲区
        buffer += decoder.decode(value, { stream: true })
        // 按 SSE 分隔符切割消息
        const chunks = buffer.split(/\r?\n\r?\n/)
        buffer = chunks.pop() ?? '' // 剩余不完整数据留在缓冲区

        // 逐条处理
        for (const chunk of chunks) {
          if (closed) break
          processEventChunk(chunk)
        }
      }
    } catch (error) {
      // 非主动中断的异常才提示错误
      if (!closed && !(error instanceof DOMException && error.name === 'AbortError')) {
        onError('SSE 连接异常，请稍后重试。')
      }
      close()
    }
  }

  // 启动请求
  void start()

  // 返回关闭方法供外部调用（停止流式输出）
  return close
}
