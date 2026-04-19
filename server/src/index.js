import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import axios from 'axios'
import { createParser } from 'eventsource-parser'
import multer from 'multer'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { createEmbeddingClient } from './embeddingClient.js'
import { createRagStore } from './ragStore.js'

// 加载环境变量
dotenv.config()

// ============================================
// 进程级错误处理（防止崩溃）
// ============================================

// 捕获未处理的同步异常
process.on('uncaughtException', (error) => {
  console.error('[server] uncaughtException:', error)
})

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason)
})

// 进程退出日志
process.on('exit', (code) => {
  console.log(`[server] process exit with code ${code}`)
})

// ============================================
//  Express 应用初始化
// ============================================

const app = express()

// ------------------- 配置读取 -------------------

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

// LLM 提供商配置（支持智谱、通义千问等，可扩展）
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

// Embedding 配置
const embeddingPath = process.env.LLM_EMBEDDING_PATH ?? 'embeddings'
const embeddingModel = process.env.LLM_EMBEDDING_MODEL ?? 'embedding-3'

// RAG 配置
const ragDbPath = process.env.RAG_DB_PATH ?? './data/rag.sqlite'
const ragMaxUploadMb = parsePositiveInt(process.env.RAG_MAX_UPLOAD_MB, 30)

// 辅助函数：解析正整数，失败返回默认值
function parsePositiveInt(raw, fallback) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

// 上下文限制配置（防止 Token 超限）
const maxContextMessages = parsePositiveInt(process.env.LLM_MAX_CONTEXT_MESSAGES, 24)
const maxContextChars = parsePositiveInt(process.env.LLM_MAX_CONTEXT_CHARS, 12000)
const maxSingleMessageChars = parsePositiveInt(process.env.LLM_MAX_SINGLE_MESSAGE_CHARS, 4000)

// ============================================
// 服务初始化
// ============================================

// 创建 Embedding 客户端（用于 RAG 向量计算）
const embeddingClient = createEmbeddingClient({
  providerBaseUrl,
  embeddingPath,
  embeddingModel,
  apiKey: providerApiKey,
  apiKeyHeader: providerApiKeyHeader,
  apiKeyPrefix: providerApiKeyPrefix,
})

// 创建 RAG 存储实例（SQLite + 向量检索）
const ragStore = createRagStore({
  dbFilePath: ragDbPath,
  embedText: embeddingClient.embedText,
  embeddingModelName: embeddingModel,
})

// 配置 Multer 文件上传（内存存储，限制大小）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ragMaxUploadMb * 1024 * 1024,
  },
})

// ============================================
// 工具函数
// ============================================

/**
 * 生成当前时间标签（HH:mm:ss 格式）
 */
function nowTimeLabel() {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * 构建 RAG 系统提示词
 * 将检索结果格式化为参考资料，插入到系统消息中
 * 
 * @param results - 检索结果数组（包含 source, score, content）
 * @returns 格式化的系统提示词，无结果返回空字符串
 */
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

/**
 * 从 PDF Buffer 中提取文本
 * 使用 pdf-parse 库，处理完后销毁解析器释放内存
 * 
 * @param buffer - PDF 文件 Buffer
 * @returns 提取的文本内容
 */
async function extractTextFromPdf(buffer) {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return String(result?.text ?? '').trim()
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => {})
    }
  }
}

/**
 * 从上传文件中提取文本（支持多种格式）
 * 
 * 支持的格式：
 * - PDF：使用 pdf-parse（支持扫描件降级提示）
 * - DOCX：使用 mammoth 提取原文
 * - 文本文件：直接 UTF-8 解码（txt/md/csv/json）
 * 
 * @param file - Multer 文件对象（包含 buffer, originalname, mimetype）
 * @returns 提取的纯文本内容
 * @throws 不支持的格式或解析失败时抛出错误
 */
async function extractTextFromUpload(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('上传文件无效。')
  }

  const name = String(file.originalname ?? '').toLowerCase()
  const mime = String(file.mimetype ?? '').toLowerCase()
  const safeName = normalizeUploadedFileName(file.originalname)

  // 构建降级提示文本（当解析失败或为空时返回）
  const buildFallbackText = (reason) => {
    return [
      `文档名: ${safeName}`,
      '状态: 解析降级（已入库）',
      `原因: ${reason}`,
      '说明: 原文档未提取到可检索正文，建议上传可复制文本的 PDF 或先做 OCR 后再上传。',
    ].join('\n')
  }

  // PDF 处理
  if (name.endsWith('.pdf') || mime.includes('application/pdf')) {
    try {
      const text = await extractTextFromPdf(file.buffer)
      if (text) {
        return text
      }
      // 扫描件通常解析为空，给出友好提示而非报错
      return buildFallbackText('PDF 解析为空（常见于扫描件）')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF 解析失败'
      return buildFallbackText(message)
    }
  }

  // DOCX 处理
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

  // 文本文件处理（通过文件名或 MIME 类型判断）
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

/**
 * 规范化上传文件名（修复编码问题）
 * 
 * 浏览器 multipart 上传时，中文文件名在某些场景会被错误编码为 latin1，
 * 此函数检测并修复此类问题
 * 
 * @param name - 原始文件名
 * @returns 修复后的文件名
 */
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

// ============================================
// 中间件配置
// ============================================

// CORS：允许前端跨域访问
app.use(
  cors({
    origin: frontendOrigin,
  }),
)

// JSON 解析（限制 2MB，防止过大请求）
app.use(express.json({ limit: '2mb' }))

// ============================================
// API 路由：健康检查
// ============================================

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-chat-platform-server',
    time: new Date().toISOString(),
  })
})

// ============================================
// API 路由：知识库管理（CRUD）
// ============================================

// 列出所有知识库
app.get('/api/rag/kbs', (_req, res) => {
  res.json(ragStore.listKnowledgeBases())
})

// 创建知识库
app.post('/api/rag/kbs', (req, res) => {
  const name = String(req.body?.name ?? '')

  try {
    const kb = ragStore.createKnowledgeBase(name, nowTimeLabel())
    if (!kb) {
      res.status(500).json({ error: { message: '创建知识库失败。' } })
      return
    }

    res.status(201).json(kb)
  } catch (error) {
    res.status(400).json({
      error: {
        message: error instanceof Error ? error.message : '创建知识库失败。',
      },
    })
  }
})

// 获取知识库下的文档列表
app.get('/api/rag/kbs/:kbId/documents', (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const docs = ragStore.listKnowledgeBaseDocuments(kbId)

  if (!docs) {
    res.status(404).json({ error: { message: '知识库不存在。' } })
    return
  }

  res.json(docs)
})

// 上传文档到知识库（自动解析、分块、向量化入库）
app.post('/api/rag/kbs/:kbId/documents/upload', upload.single('file'), async (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const file = req.file

  if (!file) {
    res.status(400).json({ error: { message: '请选择上传文件。' } })
    return
  }

  try {
    // 提取文件文本
    const text = await extractTextFromUpload(file)
    
    // 入库处理（分块、Embedding、写入 SQLite）
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

// 全局错误处理中间件（处理 Multer 文件大小超限等）
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

// 切换知识库启用状态
app.patch('/api/rag/kbs/:kbId/active', (req, res) => {
  const kbId = String(req.params.kbId ?? '')
  const kb = ragStore.toggleKnowledgeBaseActive(kbId, nowTimeLabel())
  if (!kb) {
    res.status(404).json({ error: { message: '知识库不存在。' } })
    return
  }

  res.json(kb)
})

// 切换文档启用状态
app.patch('/api/rag/documents/:docId/active', (req, res) => {
  const docId = String(req.params.docId ?? '')
  const doc = ragStore.toggleDocumentActive(docId, nowTimeLabel())
  if (!doc) {
    res.status(404).json({ error: { message: '文档不存在。' } })
    return
  }

  res.json(doc)
})

// 删除文档
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

// 重建知识库向量索引（更换模型后重新计算）
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

// 测试检索接口（用于调试 RAG 效果）
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

// ============================================
// 工具函数：SSE（Server-Sent Events）
// ============================================

/**
 * 向 SSE 流写入数据
 * 
 * @param res - Express 响应对象
 * @param data - 要发送的数据（对象或字符串）
 * @param eventName - 可选的事件名称（如 'done', 'citations'）
 */
function writeSse(res, data, eventName) {
  if (eventName) {
    res.write(`event: ${eventName}\n`)
  }

  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

/**
 * 构建 LLM 提供商完整 URL
 */
function buildProviderUrl() {
  const base = providerBaseUrl.endsWith('/')
    ? providerBaseUrl.slice(0, -1)
    : providerBaseUrl
  const path = providerChatPath.startsWith('/')
    ? providerChatPath.slice(1)
    : providerChatPath

  return `${base}/${path}`
}

/**
 * 从多种 LLM 响应格式中提取增量文本
 * 兼容 OpenAI、智谱 GLM、通义千问等格式
 */
function extractDelta(payload) {
  return (
    payload?.choices?.[0]?.delta?.content ??      // OpenAI 流式标准
    payload?.choices?.[0]?.message?.content ??     // OpenAI 非流式
    payload?.output_text ??                       // 某些国产模型格式
    payload?.delta ??                             // 通用增量字段
    payload?.content ??                           // 通用内容字段
    payload?.text                                 // 备用文本字段
  )
}

/**
 * 规范化模型名称
 * 兜底默认使用 glm-4-flash，避免空模型导致错误
 */
function normalizeModel(rawModel) {
  const normalized = String(rawModel ?? '').trim().toLowerCase()

  if (!normalized) {
    return 'glm-4-flash'
  }

  // 特定模型映射（如需限制模型范围可在此扩展）
  if (normalized === 'qwen-plus' || normalized === 'qwen-max') {
    return 'glm-4-flash'
  }

  return rawModel
}

/**
 * 规范化聊天检索模式参数
 * 将前端的 'off' 映射为 'general'（通用模式），避免后端跳过 RAG 逻辑
 */
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

// 允许的角色集合（过滤非法角色）
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])

/**
 * 截断超长内容
 * 
 * @param content - 原始内容
 * @param limit - 最大字符数
 * @returns 截断后的内容（带 ...[truncated] 标记）
 */
function truncateContent(content, limit) {
  if (content.length <= limit) {
    return content
  }
  return `${content.slice(0, limit)}\n...[truncated]`
}

/**
 * 应用上下文限制策略（三层保护）
 * 
 * 1. 按消息数量限制：保留最近 N 条（默认 24 条）
 * 2. 单条消息长度限制：每条最多 N 字符（默认 4000）
 * 3. 总字符数限制：所有消息总和不超过 N 字符（默认 12000），超限从最旧消息开始丢弃
 * 
 * @param messages - 原始消息数组
 * @returns 限制后的消息数组
 */
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

  // 如果只剩一条且仍超长，强制截断
  if (result.length === 1 && result[0].content.length > maxContextChars) {
    result[0] = {
      ...result[0],
      content: truncateContent(result[0].content, maxContextChars),
    }
  }

  return result
}

/**
 * 规范化消息输入（支持多种格式）
 * 
 * 支持输入格式：
 * - 标准数组格式：[{role, content}, ...]
 * - JSON 字符串："[{role, content}, ...]"
 * - 兜底：单条用户消息（使用 fallbackPrompt）
 * 
 * @param rawMessages - 原始输入（数组或 JSON 字符串）
 * @param fallbackPrompt - 兜底提示词（当 rawMessages 无效时使用）
 * @returns 规范化的消息数组（已应用上下文限制）
 */
function normalizeMessages(rawMessages, fallbackPrompt) {
  // 处理已经是数组的情况
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

  // 处理 JSON 字符串格式
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

  // 兜底：使用 fallbackPrompt 创建单条用户消息
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

/**
 * 规范化附件文档 ID 列表（用于限定 RAG 检索范围）
 * 
 * @param rawDocIds - 原始输入（可能是数组）
 * @returns 清理后的字符串 ID 数组
 */
function normalizeAttachmentDocIds(rawDocIds) {
  if (!Array.isArray(rawDocIds)) {
    return []
  }

  return rawDocIds
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
}

// ============================================
// API 路由：流式聊天（核心功能）
// ============================================

app.post('/api/chat/stream', async (req, res) => {
  // ------------------- 参数解析 -------------------
  
  const sessionId = String(req.body?.sessionId ?? '')
  const prompt = String(req.body?.prompt ?? '')
  const model = normalizeModel(req.body?.model)
  const knowledgeBaseId = String(req.body?.knowledgeBaseId ?? '')
  const retrievalModeRaw = String(req.body?.retrievalMode ?? 'balanced')
  const topK = parsePositiveInt(req.body?.topK, 4)
  const attachmentDocIds = normalizeAttachmentDocIds(req.body?.attachmentDocIds)
  const retrievalMode = normalizeChatRetrievalMode(retrievalModeRaw)
  
  // 规范化消息（应用上下文限制）
  let messages = normalizeMessages(req.body?.messages, prompt)
  let citations = []

  // ------------------- 参数校验 -------------------
  
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

  // ------------------- RAG 检索阶段 -------------------
  
  // 通用模式直接跳过 RAG 检索，降低后端开销。
  if (knowledgeBaseId && retrievalMode !== 'general') {
    try {
      citations = await ragStore.search(
        knowledgeBaseId,
        prompt,
        topK,
        retrievalMode,
        attachmentDocIds,
      )
      const ragPrompt = buildRagSystemPrompt(citations)
      if (ragPrompt) {
        // 将检索结果作为系统消息插入到最前面（保留用户原始上下文）
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

  // ------------------- SSE 响应头设置 -------------------
  
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  // 如果有检索结果，先发送引用来源事件（前端可据此展示参考卡片）
  if (Array.isArray(citations) && citations.length > 0) {
    writeSse(res, { citations }, 'citations')
  }

  // ------------------- 心跳与连接管理 -------------------
  
  // 每 20 秒发送一次心跳注释（防止 Nginx/CDN 断开空闲连接）
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

  // ------------------- 上游 LLM 请求 -------------------
  
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
      timeout: 0,               // 无超时（流式响应可能很长）
      validateStatus: (status) => status >= 200 && status < 500,
    })

    if (upstream.status >= 400) {
      const requestUrl = buildProviderUrl()
      writeSse(res, {
        error: {
          message: `上游返回异常状态码: ${upstream.status}،请求地址: ${requestUrl}`,
        },
      })
      close()
      return
    }

    // ------------------- 流式数据转发 -------------------
    
    let done = false
    const decoder = new TextDecoder()
    
    // 使用 eventsource-parser 解析 SSE 流
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
          // 非 JSON 数据（如纯文本行），直接作为 delta 转发
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

// ============================================
// 服务器启动
// ============================================

const server = app.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('[server] listen error:', error)
})