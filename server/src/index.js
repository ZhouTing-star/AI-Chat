import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import axios from 'axios'
import { createParser } from 'eventsource-parser'

dotenv.config()

process.on('uncaughtException', (error) => {
  console.error('[server] uncaughtException:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason)
})

process.on('exit', (code) => {
  console.log(`[server] process exit with code ${code}`)
})

const app = express()

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
const providerBaseUrl =
  process.env.LLM_BASE_URL ??
  process.env.ZHIPU_BASE_URL ??
  process.env.QWEN_BASE_URL ??
  'https://open.bigmodel.cn/api/paas/v4'
const providerChatPath =
  process.env.LLM_CHAT_PATH ??
  process.env.ZHIPU_CHAT_PATH ??
  process.env.QWEN_CHAT_PATH ??
  'chat/completions'
const providerApiKey =
  process.env.LLM_API_KEY ?? process.env.ZHIPU_API_KEY ?? process.env.QWEN_API_KEY
const providerApiKeyHeader =
  process.env.LLM_API_KEY_HEADER ??
  process.env.ZHIPU_API_KEY_HEADER ??
  process.env.QWEN_API_KEY_HEADER ??
  'Authorization'
const providerApiKeyPrefix =
  process.env.LLM_API_KEY_PREFIX ??
  process.env.ZHIPU_API_KEY_PREFIX ??
  process.env.QWEN_API_KEY_PREFIX ??
  'Bearer'

app.use(
  cors({
    origin: frontendOrigin,
  }),
)

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-chat-platform-server',
    time: new Date().toISOString(),
  })
})

function writeSse(res, data, eventName) {
  if (eventName) {
    res.write(`event: ${eventName}\n`)
  }

  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

function buildProviderUrl() {
  const base = providerBaseUrl.endsWith('/')
    ? providerBaseUrl.slice(0, -1)
    : providerBaseUrl
  const path = providerChatPath.startsWith('/')
    ? providerChatPath.slice(1)
    : providerChatPath

  return `${base}/${path}`
}

function extractDelta(payload) {
  return (
    payload?.choices?.[0]?.delta?.content ??
    payload?.choices?.[0]?.message?.content ??
    payload?.output_text ??
    payload?.delta ??
    payload?.content ??
    payload?.text
  )
}

function normalizeModel(rawModel) {
  const normalized = String(rawModel ?? '').trim().toLowerCase()

  if (!normalized) {
    return 'glm-4-flash'
  }

  if (normalized === 'qwen-plus' || normalized === 'qwen-max') {
    return 'glm-4-flash'
  }

  return rawModel
}

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])

function normalizeMessages(rawMessages, fallbackPrompt) {
  const raw = Array.isArray(rawMessages) ? rawMessages[0] : rawMessages

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const list = parsed
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            role: String(item.role ?? ''),
            content: String(item.content ?? ''),
          }))
          .filter(
            (item) => ALLOWED_ROLES.has(item.role) && item.content.trim().length > 0,
          )

        if (list.length > 0) {
          return list
        }
      }
    } catch {
      // ignore invalid messages json
    }
  }

  if (fallbackPrompt.trim()) {
    return [
      {
        role: 'user',
        content: fallbackPrompt,
      },
    ]
  }

  return []
}

app.get('/api/chat/stream', async (req, res) => {
  const sessionId = String(req.query.sessionId ?? '')
  const prompt = String(req.query.prompt ?? '')
  const model = normalizeModel(req.query.model)
  const messages = normalizeMessages(req.query.messages, prompt)

  if (!sessionId || messages.length === 0) {
    res.status(400).json({
      error: {
        message: 'sessionId 不能为空，且 messages 或 prompt 至少提供一个有效输入。',
      },
    })
    return
  }

  if (!providerApiKey) {
    res.status(500).json({
      error: {
        message: '后端未配置 LLM_API_KEY（或 ZHIPU_API_KEY / QWEN_API_KEY）。',
      },
    })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  const heartbeatTimer = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 20000)

  const controller = new AbortController()
  let closed = false

  const close = () => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(heartbeatTimer)
    controller.abort()

    if (!res.writableEnded) {
      res.end()
    }
  }

  req.on('close', close)

  try {
    const upstreamHeaders = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      [providerApiKeyHeader]: `${providerApiKeyPrefix} ${providerApiKey}`,
    }

    const upstreamBody = {
      model,
      stream: true,
      messages,
    }

    const upstream = await axios.post(buildProviderUrl(), upstreamBody, {
      headers: upstreamHeaders,
      responseType: 'stream',
      signal: controller.signal,
      timeout: 0,
      validateStatus: (status) => status >= 200 && status < 500,
    })

    if (upstream.status >= 400) {
      const requestUrl = buildProviderUrl()
      writeSse(res, {
        error: {
          message: `上游返回异常状态码: ${upstream.status}，请求地址: ${requestUrl}`,
        },
      })
      close()
      return
    }

    let done = false
    const decoder = new TextDecoder()
    const parser = createParser({
      onEvent(event) {
        if (event.data === '[DONE]') {
          done = true
          writeSse(res, { done: true }, 'done')
          close()
          return
        }

        try {
          const json = JSON.parse(event.data)
          const delta = extractDelta(json)

          if (typeof delta === 'string' && delta.length > 0) {
            writeSse(res, { delta })
          }
        } catch {
          if (event.data?.trim()) {
            writeSse(res, { delta: event.data })
          }
        }
      },
    })

    upstream.data.on('data', (chunk) => {
      parser.feed(decoder.decode(chunk, { stream: true }))
    })

    upstream.data.on('end', () => {
      if (!done && !closed) {
        writeSse(res, { done: true }, 'done')
      }
      close()
    })

    upstream.data.on('error', () => {
      if (!closed) {
        writeSse(res, { error: { message: '上游流读取失败。' } })
      }
      close()
    })
  } catch (error) {
    if (!closed) {
      writeSse(res, { error: { message: error instanceof Error ? error.message : 'SSE 转发失败。' } })
    }
    close()
  }
})

const server = app.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('[server] listen error:', error)
})
