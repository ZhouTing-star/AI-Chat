// 加载环境变量配置文件（.env）
import dotenv from 'dotenv'
// 处理跨域资源共享
import cors from 'cors'
// Express 服务框架
import express from 'express'
// 发送 HTTP 请求
import axios from 'axios'
// 解析 SSE（服务器推送事件）流
import { createParser } from 'eventsource-parser'

dotenv.config()

// 捕获未捕获的异常，防止服务崩溃
process.on('uncaughtException', (error) => {
  console.error('[server] uncaughtException:', error)
})

// 捕获未处理的 Promise 拒绝错误
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason)
})

// 进程退出时打印日志
process.on('exit', (code) => {
  console.log(`[server] process exit with code ${code}`)
})

// 创建 Express 应用实例
const app = express()

// 从环境变量读取服务配置，无配置则使用默认值
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
// 前端允许跨域的地址
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

// 大模型接口基础地址（兼容多个厂商配置）
const providerBaseUrl =
  process.env.LLM_BASE_URL ??
  process.env.ZHIPU_BASE_URL ??
  process.env.QWEN_BASE_URL ??
  'https://open.bigmodel.cn/api/paas/v4'

// 大模型对话接口路径
const providerChatPath =
  process.env.LLM_CHAT_PATH ??
  process.env.ZHIPU_CHAT_PATH ??
  process.env.QWEN_CHAT_PATH ??
  'chat/completions'

// 大模型 API Key
const providerApiKey =
  process.env.LLM_API_KEY ?? process.env.ZHIPU_API_KEY ?? process.env.QWEN_API_KEY

// API Key 请求头名称
const providerApiKeyHeader =
  process.env.LLM_API_KEY_HEADER ??
  process.env.ZHIPU_API_KEY_HEADER ??
  process.env.QWEN_API_KEY_HEADER ??
  'Authorization'

// API Key 前缀（如 Bearer）
const providerApiKeyPrefix =
  process.env.LLM_API_KEY_PREFIX ??
  process.env.ZHIPU_API_KEY_PREFIX ??
  process.env.QWEN_API_KEY_PREFIX ??
  'Bearer'

// 配置跨域：只允许前端地址访问
app.use(
  cors({
    origin: frontendOrigin,
  }),
)

// 健康检查接口：用于测试服务是否正常运行
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-chat-platform-server',
    time: new Date().toISOString(),
  })
})


/**
 * 向客户端发送 SSE 事件
 * @param {Response} res - Express 响应对象
 * @param {any} data - 要发送的数据
 * @param {string} [eventName] - 事件名称（可选）
 */
function writeSse(res, data, eventName) {
  // 如果有事件名，先写入事件名
  if (eventName) {
    res.write(`event: ${eventName}\n`)
  }

  // 数据统一转为字符串，写入 SSE 格式
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

/**
 * 拼接大模型接口完整地址
 * @returns {string} 拼接后的地址
 */
function buildProviderUrl() {
  // 处理 baseUrl 末尾多余的 /
  const base = providerBaseUrl.endsWith('/')
    ? providerBaseUrl.slice(0, -1)
    : providerBaseUrl
  // 处理 path 开头多余的 /
  const path = providerChatPath.startsWith('/')
    ? providerChatPath.slice(1)
    : providerChatPath

  return `${base}/${path}`
}

/**
 * 从大模型返回的不同格式中提取流式文本片段
 * @param {object} payload - 大模型返回数据
 * @returns {string} 提取到的文本
 */
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

/**
 * 标准化模型名称，统一不规范的模型名
 * @param {string} rawModel - 原始模型名
 * @returns {string} 标准化后的模型名
 */
function normalizeModel(rawModel) {
  const normalized = String(rawModel ?? '').trim().toLowerCase()

  // 空值默认使用 glm-4-flash
  if (!normalized) {
    return 'glm-4-flash'
  }

  // 兼容通义千问模型名称，统一转为 glm-4-flash
  if (normalized === 'qwen-plus' || normalized === 'qwen-max') {
    return 'glm-4-flash'
  }

  return rawModel
}

// 允许的消息角色
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])

/**
 * 标准化前端传入的消息格式
 * @param {any} rawMessages - 原始消息
 * @param {string} fallbackPrompt - 备用提示词
 * @returns {object[]} 格式化后的消息数组
 */
function normalizeMessages(rawMessages, fallbackPrompt) {
  const raw = Array.isArray(rawMessages) ? rawMessages[0] : rawMessages

  // 如果是字符串，尝试解析为 JSON
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        // 过滤并格式化消息
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
      // 解析失败则忽略
    }
  }

  // 如果没有有效消息，使用备用提示词
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
// 流式对话接口（核心接口）
app.get('/api/chat/stream', async (req, res) => {
  // 获取前端参数
  const sessionId = String(req.query.sessionId ?? '')
  const prompt = String(req.query.prompt ?? '')
  const model = normalizeModel(req.query.model)
  const messages = normalizeMessages(req.query.messages, prompt)

  // 参数校验：必须有 sessionId 和有效消息
  if (!sessionId || messages.length === 0) {
    res.status(400).json({
      error: {
        message: 'sessionId 不能为空，且 messages 或 prompt 至少提供一个有效输入。',
      },
    })
    return
  }

  // 校验 API Key 是否配置
  if (!providerApiKey) {
    res.status(500).json({
      error: {
        message: '后端未配置 LLM_API_KEY（或 ZHIPU_API_KEY / QWEN_API_KEY）。',
      },
    })
    return
  }

  // 设置 SSE 响应头，实现流式输出
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // 立即发送响应头
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  // 心跳保活：每 20s 发送空数据，防止连接断开
  const heartbeatTimer = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 20000)

  // 用于中断请求
  const controller = new AbortController()
  let closed = false

  /**
   * 关闭流、清理定时器、中断请求
   */
  const close = () => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(heartbeatTimer)
    controller.abort()

    // 如果响应未结束，手动结束
    if (!res.writableEnded) {
      res.end()
    }
  }

  // 客户端断开连接时清理资源
  req.on('close', close)

  try {
    // 构造请求大模型的请求头
    const upstreamHeaders = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      [providerApiKeyHeader]: `${providerApiKeyPrefix} ${providerApiKey}`,
    }

    // 构造请求体
    const upstreamBody = {
      model,
      stream: true, // 开启流式输出
      messages,
    }

    // 向大模型发送 POST 请求，获取流式响应
    const upstream = await axios.post(buildProviderUrl(), upstreamBody, {
      headers: upstreamHeaders,
      responseType: 'stream', // 响应按流处理
      signal: controller.signal,
      timeout: 0, // 不超时
      validateStatus: (status) => status >= 200 && status < 500,
    })

    // 上游返回错误状态码
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
    // 文本解码器
    const decoder = new TextDecoder()
    // 创建 SSE 流解析器
    const parser = createParser({
      // 解析到事件时触发
      onEvent(event) {
        // 大模型流结束标志
        if (event.data === '[DONE]') {
          done = true
          writeSse(res, { done: true }, 'done')
          close()
          return
        }

        try {
          // 解析 JSON，提取文本片段
          const json = JSON.parse(event.data)
          const delta = extractDelta(json)

          // 有内容则推送给前端
          if (typeof delta === 'string' && delta.length > 0) {
            writeSse(res, { delta })
          }
        } catch {
          // 解析失败则直接返回原始数据
          if (event.data?.trim()) {
            writeSse(res, { delta: event.data })
          }
        }
      },
    })

    // 接收上游流数据，交给 SSE 解析器
    upstream.data.on('data', (chunk) => {
      parser.feed(decoder.decode(chunk, { stream: true }))
    })

    // 上游流结束
    upstream.data.on('end', () => {
      if (!done && !closed) {
        writeSse(res, { done: true }, 'done')
      }
      close()
    })

    // 上游流异常
    upstream.data.on('error', () => {
      if (!closed) {
        writeSse(res, { error: { message: '上游流读取失败。' } })
      }
      close()
    })
  } catch (error) {
    // 捕获请求异常，返回给前端
    if (!closed) {
      writeSse(res, { error: { message: error instanceof Error ? error.message : 'SSE 转发失败。' } })
    }
    close()
  }
})

// 启动服务
const server = app.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`)
})

// 服务启动错误监听
server.on('error', (error) => {
  console.error('[server] listen error:', error)
})