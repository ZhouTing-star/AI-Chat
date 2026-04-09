import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import axios from 'axios'
import { createParser } from 'eventsource-parser'
import multer from 'multer'
import mammoth from 'mammoth'
import { createRequire } from 'node:module'
import { createEmbeddingClient } from './embeddingClient.js'
import { createRagStore } from './ragStore.js'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

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
const embeddingPath = process.env.LLM_EMBEDDING_PATH ?? 'embeddings'
const embeddingModel = process.env.LLM_EMBEDDING_MODEL ?? 'embedding-3'
const ragDbPath = process.env.RAG_DB_PATH ?? './data/rag.sqlite'
const ragMaxUploadMb = parsePositiveInt(process.env.RAG_MAX_UPLOAD_MB, 30)

function parsePositiveInt(raw, fallback) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const maxContextMessages = parsePositiveInt(process.env.LLM_MAX_CONTEXT_MESSAGES, 24)
const maxContextChars = parsePositiveInt(process.env.LLM_MAX_CONTEXT_CHARS, 12000)
const maxSingleMessageChars = parsePositiveInt(process.env.LLM_MAX_SINGLE_MESSAGE_CHARS, 4000)

const embeddingClient = createEmbeddingClient({
  providerBaseUrl,
  embeddingPath,
  embeddingModel,
  apiKey: providerApiKey,
  apiKeyHeader: providerApiKeyHeader,
  apiKeyPrefix: providerApiKeyPrefix,
})

const ragStore = createRagStore({
  dbFilePath: ragDbPath,
  embedText: embeddingClient.embedText,
})
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ragMaxUploadMb * 1024 * 1024,
  },
})

function nowTimeLabel() {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function buildRagSystemPrompt(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return ''
  }

  const lines = results.map(
    (item, index) =>
      `[${index + 1}] 来源: ${item.source}\n相似度: ${(item.score * 100).toFixed(1)}%\n内容: ${item.content}`,
  )

  return `以下是检索到的参考资料，请优先基于资料回答；若资料不足请明确说明：\n\n${lines.join('\n\n')}`
}

async function extractTextFromUpload(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('上传文件无效。')
  }

  const name = String(file.originalname ?? '').toLowerCase()
  const mime = String(file.mimetype ?? '').toLowerCase()
  const safeName = normalizeUploadedFileName(file.originalname)

  const buildFallbackText = (reason) => {
    return [
      `文档名: ${safeName}`,
      '状态: 解析降级（已入库）',
      `原因: ${reason}`,
      '说明: 原文档未提取到可检索正文，建议上传可复制文本的 PDF 或先做 OCR 后再上传。',
    ].join('\n')
  }

  if (name.endsWith('.pdf') || mime.includes('application/pdf')) {
    try {
      const parsed = await pdfParse(file.buffer)
      const text = String(parsed?.text ?? '').trim()
      if (text) {
        return text
      }
      return buildFallbackText('PDF 解析为空（常见于扫描件）')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF 解析失败'
      return buildFallbackText(message)
    }
  }

  if (
    name.endsWith('.docx') ||
    mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ) {
    try {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer })
      const text = String(parsed?.value ?? '').trim()
      if (text) {
        return text
      }
      return buildFallbackText('DOCX 解析为空')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DOCX 解析失败'
      return buildFallbackText(message)
    }
  }

  const allowedByName =
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.markdown') ||
    name.endsWith('.csv') ||
    name.endsWith('.json')

  const allowedByMime =
    String(file.mimetype ?? '').includes('text') ||
    String(file.mimetype ?? '').includes('json') ||
    String(file.mimetype ?? '').includes('csv')

  if (allowedByName || allowedByMime) {
    return file.buffer.toString('utf-8')
  }

  throw new Error('当前仅支持 txt/md/csv/json/pdf/docx 文档上传。')
}

function normalizeUploadedFileName(name) {
  const raw = String(name ?? '').trim()
  if (!raw) {
    return 'uploaded.txt'
  }

  // 浏览器 multipart filename 在部分场景会以 latin1 解释 UTF-8。
  const decoded = Buffer.from(raw, 'latin1').toString('utf8')
  const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded)
  const rawHasCjk = /[\u4e00-\u9fff]/.test(raw)

  if (decodedHasCjk && !rawHasCjk) {
    return decoded
  }

  return raw
}

app.use(
  cors({
    origin: frontendOrigin,
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-chat-platform-server',
    time: new Date().toISOString(),
  })
})

app.get('/api/rag/kbs', (_req, res) => {
  res.json(ragStore.listKnowledgeBases())
})

app.get('/api/rag/kbs/:kbId/documents', (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const docs = ragStore.listKnowledgeBaseDocuments(kbId)

  if (!docs) {
    res.status(404).json({ error: { message: '知识库不存在。' } })
    return
  }

  res.json(docs)
})

app.post('/api/rag/kbs/:kbId/documents/upload', upload.single('file'), async (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const file = req.file

  if (!file) {
    res.status(400).json({ error: { message: '请选择上传文件。' } })
    return
  }

  try {
    const text = await extractTextFromUpload(file)
    const result = await ragStore.ingestDocument(
      kbId,
      normalizeUploadedFileName(file.originalname),
      file.size,
      text,
      nowTimeLabel(),
    )

    if (!result) {
      res.status(404).json({ error: { message: '知识库不存在。' } })
      return
    }

    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '文档入库失败。'
    const likelyClientError =
      message.includes('仅支持') ||
      message.includes('无效') ||
      message.includes('为空')

    res.status(400).json({
      error: {
        message,
      },
    })

    if (!likelyClientError) {
      // 兼容既有前端 400 处理逻辑，后续可以改成 5xx 并在前端区分重试提示。
      console.error('[upload] ingest failed:', error)
    }
  }
})

app.use((error, _req, res, next) => {
  if (!error) {
    next()
    return
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      error: {
        message: `上传文件过大，单文件不得超过 ${ragMaxUploadMb}MB。`,
      },
    })
    return
  }

  res.status(500).json({
    error: {
      message: error instanceof Error ? error.message : '服务端处理失败。',
    },
  })
})

app.patch('/api/rag/kbs/:kbId/active', (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const kb = ragStore.toggleKnowledgeBaseActive(kbId, nowTimeLabel())
  if (!kb) {
    res.status(404).json({ error: { message: '知识库不存在。' } })
    return
  }

  res.json(kb)
})

app.patch('/api/rag/documents/:docId/active', (req, res) => {
  const docId = String(req.params.docId ?? '')
  const doc = ragStore.toggleDocumentActive(docId, nowTimeLabel())
  if (!doc) {
    res.status(404).json({ error: { message: '文档不存在。' } })
    return
  }

  res.json(doc)
})

app.delete('/api/rag/documents/:docId', (req, res) => {
  const docId = String(req.params.docId ?? '')
  const doc = ragStore.deleteDocument(docId)
  if (!doc) {
    res.status(404).json({ error: { message: '文档不存在。' } })
    return
  }

  res.json({
    ok: true,
    documentId: doc.id,
  })
})

app.post('/api/rag/rebuild', async (req, res) => {
  const kbId = String(req.body?.kbId ?? '')
  try {
    const kb = await ragStore.rebuildKnowledgeBase(kbId, nowTimeLabel())
    if (!kb) {
      res.status(404).json({ error: { message: '知识库不存在。' } })
      return
    }

    res.json(kb)
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : '重建索引失败。',
      },
    })
  }
})

app.post('/api/rag/test-search', async (req, res) => {
  const kbId = String(req.body?.kbId ?? '')
  const query = String(req.body?.query ?? '')
  const topK = parsePositiveInt(req.body?.topK, 5)
  const mode = String(req.body?.mode ?? 'hybrid')

  try {
    const safeMode = mode === 'vector' || mode === 'off' ? mode : 'hybrid'
    const results = await ragStore.search(kbId, query, topK, safeMode)
    res.json(results)
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : '测试检索失败。',
      },
    })
  }
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

function normalizeChatRetrievalMode(rawMode) {
  const mode = String(rawMode ?? '').trim().toLowerCase()

  if (mode === 'strict' || mode === 'balanced' || mode === 'general') {
    return mode
  }

  // 兼容旧参数：off 等价通用，hybrid/vector 等价平衡。
  if (mode === 'off') {
    return 'general'
  }

  return 'balanced'
}

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])

function truncateContent(content, limit) {
  if (content.length <= limit) {
    return content
  }
  return `${content.slice(0, limit)}\n...[truncated]`
}

function applyContextLimits(messages) {
  // 第一步：按最近 N 条保留，优先保留最新轮次上下文。
  const cappedByCount = messages.slice(-maxContextMessages)

  // 第二步：限制单条消息长度，避免单消息过大。
  const trimmedEach = cappedByCount.map((item) => ({
    ...item,
    content: truncateContent(item.content, maxSingleMessageChars),
  }))

  // 第三步：限制总字符数，超限时从最旧消息开始丢弃。
  let totalChars = trimmedEach.reduce((sum, item) => sum + item.content.length, 0)
  const result = [...trimmedEach]

  while (result.length > 1 && totalChars > maxContextChars) {
    const removed = result.shift()
    totalChars -= removed ? removed.content.length : 0
  }

  if (result.length === 1 && result[0].content.length > maxContextChars) {
    result[0] = {
      ...result[0],
      content: truncateContent(result[0].content, maxContextChars),
    }
  }

  return result
}

function normalizeMessages(rawMessages, fallbackPrompt) {
  if (Array.isArray(rawMessages)) {
    const list = rawMessages
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        role: String(item.role ?? ''),
        content: String(item.content ?? ''),
      }))
      .filter(
        (item) => ALLOWED_ROLES.has(item.role) && item.content.trim().length > 0,
      )

    if (list.length > 0) {
      return applyContextLimits(list)
    }
  }

  const raw = rawMessages

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
          return applyContextLimits(list)
        }
      }
    } catch {
      // ignore invalid messages json
    }
  }

  if (fallbackPrompt.trim()) {
    return applyContextLimits([
      {
        role: 'user',
        content: fallbackPrompt,
      },
    ])
  }

  return []
}

app.post('/api/chat/stream', async (req, res) => {
  const sessionId = String(req.body?.sessionId ?? '')
  const prompt = String(req.body?.prompt ?? '')
  const model = normalizeModel(req.body?.model)
  const knowledgeBaseId = String(req.body?.knowledgeBaseId ?? '')
  const retrievalModeRaw = String(req.body?.retrievalMode ?? 'balanced')
  const topK = parsePositiveInt(req.body?.topK, 4)
  const retrievalMode = normalizeChatRetrievalMode(retrievalModeRaw)
  let messages = normalizeMessages(req.body?.messages, prompt)
  let citations = []

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

  const isStrictMode = retrievalMode === 'strict'

  // 通用模式直接跳过 RAG 检索，降低后端开销。
  if (knowledgeBaseId && retrievalMode !== 'general') {
    try {
      citations = await ragStore.search(knowledgeBaseId, prompt, topK, retrievalMode)
      const ragPrompt = buildRagSystemPrompt(citations)
      if (ragPrompt) {
        messages = applyContextLimits([
          {
            role: 'system',
            content: ragPrompt,
          },
          ...messages,
        ])
      }
    } catch (error) {
      console.error('[rag] retrieve failed:', error)
    }
  }

  // 严格模式下，知识库缺失命中时必须拒答，避免模型回退到通用知识作答。
  if (isStrictMode && citations.length === 0) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }

    const refusalText = knowledgeBaseId
      ? '当前为严格模式，但知识库未检索到足够相关的资料（阈值 0.7）。请补充知识库内容或切换到平衡/通用模式后再试。'
      : '当前为严格模式，但未选择可用知识库，无法基于资料回答。请先启用知识库或切换到平衡/通用模式。'

    writeSse(res, { delta: refusalText })
    writeSse(res, { done: true }, 'done')
    res.end()
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  if (Array.isArray(citations) && citations.length > 0) {
    writeSse(res, { citations }, 'citations')
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

  // POST 请求在 body 读取完成后也可能触发 req.close，
  // 这里改为监听 req.aborted + res.close，避免流式响应被提前中断。
  req.on('aborted', close)
  res.on('close', close)

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
