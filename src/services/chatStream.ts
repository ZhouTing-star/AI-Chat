// 引入SSE兼容库，解决部分浏览器不支持EventSource的问题
import { EventSourcePolyfill } from 'event-source-polyfill'

interface StreamPayload {
  delta?: string
  content?: string
  text?: string
  done?: boolean
  event?: string
  error?: string | { message?: string }
}

interface StreamContextMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface StreamChatOptions {
  sessionId: string
  prompt: string
  model: string
  messages?: StreamContextMessage[]
  token?: string
  onChunk: (chunk: string) => void
  onDone: () => void
  onError: (error: string) => void
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

function parseData(data: string): { chunk?: string; done?: boolean; error?: string } {
  const trimmed = data.trim()

  if (!trimmed) {
    return {}
  }

  if (trimmed === '[DONE]') {
    return { done: true }
  }

  try {
    const payload = JSON.parse(trimmed) as StreamPayload
    const error =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message

    if (error) {
      return { error }
    }

    const chunk = payload.delta ?? payload.content ?? payload.text
    const done = payload.done || payload.event === 'done'

    return { chunk, done }
  } catch {
    return { chunk: trimmed }
  }
}

export function streamChatReply(options: StreamChatOptions): () => void {
  const { sessionId, prompt, model, messages = [], token, onChunk, onDone, onError } = options

  const url = resolveApiUrl('/api/chat/stream')
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('prompt', prompt)
  url.searchParams.set('model', model)
  if (messages.length > 0) {
    url.searchParams.set('messages', JSON.stringify(messages))
  }

  const tokenHeader = (import.meta.env.VITE_API_TOKEN_HEADER as string | undefined) ?? 'Authorization'
  const tokenPrefix = (import.meta.env.VITE_API_TOKEN_PREFIX as string | undefined) ?? 'Bearer'
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  }

  if (token) {
    headers[tokenHeader] = `${tokenPrefix} ${token}`
  }

  const source = new EventSourcePolyfill(url.toString(), {
    headers,
    heartbeatTimeout: 120000,
  })

  let closed = false

  const close = () => {
    if (closed) {
      return
    }

    closed = true
    source.close()
  }

  source.onmessage = (event) => {
    const result = parseData(event.data)

    if (result.error) {
      onError(result.error)
      close()
      return
    }

    if (result.chunk) {
      onChunk(result.chunk)
    }

    if (result.done) {
      onDone()
      close()
    }
  }

  source.addEventListener('done', () => {
    onDone()
    close()
  })

  source.onerror = () => {
    onError('SSE 连接异常，请稍后重试。')
    close()
  }

  return close
}
