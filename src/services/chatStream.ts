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

  const tokenHeader = (import.meta.env.VITE_API_TOKEN_HEADER as string | undefined) ?? 'Authorization'
  const tokenPrefix = (import.meta.env.VITE_API_TOKEN_PREFIX as string | undefined) ?? 'Bearer'
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }

  if (token) {
    headers[tokenHeader] = `${tokenPrefix} ${token}`
  }

  const controller = new AbortController()
  let doneNotified = false

  let closed = false

  const close = () => {
    if (closed) {
      return
    }

    closed = true
    controller.abort()
  }

  const notifyDone = () => {
    if (doneNotified) {
      return
    }
    doneNotified = true
    onDone()
  }

  const processEventChunk = (rawChunk: string) => {
    const lines = rawChunk.split(/\r?\n/)
    let eventName = 'message'
    const dataLines: string[] = []

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

    if (eventName === 'done') {
      notifyDone()
      close()
      return
    }

    const result = parseData(dataLines.join('\n'))
    if (result.error) {
      onError(result.error)
      close()
      return
    }

    if (result.chunk) {
      onChunk(result.chunk)
    }

    if (result.done) {
      notifyDone()
      close()
    }
  }

  const start = async () => {
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId,
          prompt,
          model,
          messages,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let message = `请求失败，状态码 ${response.status}`
        try {
          const text = await response.text()
          if (text.trim()) {
            message = text
          }
        } catch {
          // ignore body parse error
        }
        onError(message)
        close()
        return
      }

      if (!response.body) {
        onError('SSE 响应体为空。')
        close()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (!closed) {
        const { value, done } = await reader.read()
        if (done) {
          if (!closed) {
            notifyDone()
            close()
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split(/\r?\n\r?\n/)
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          if (closed) {
            break
          }
          processEventChunk(chunk)
        }
      }
    } catch (error) {
      if (!closed && !(error instanceof DOMException && error.name === 'AbortError')) {
        onError('SSE 连接异常，请稍后重试。')
      }
      close()
    }
  }

  void start()

  return close
}
