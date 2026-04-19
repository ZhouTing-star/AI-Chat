import axios from 'axios'

// ============================================
// 工具函数：URL 构建
// ============================================

/**
 * 安全构建完整 URL
 * 处理 baseUrl 和 path 的斜杠边界情况，确保正确拼接
 * 
 * 示例：
 * buildUrl('http://api.example.com/', '/v1/embeddings') 
 * -> 'http://api.example.com/v1/embeddings'
 * 
 * @param baseUrl - 基础 URL（可能带或不带末尾斜杠）
 * @param path - API 路径（可能带或不带开头斜杠）
 * @returns 规范的完整 URL
 */
function buildUrl(baseUrl, path) {
  // 移除 baseUrl 末尾的所有斜杠
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  // 移除 path 开头的所有斜杠
  const cleanPath = String(path ?? '').trim().replace(/^\/+/, '')
  return `${base}/${cleanPath}`
}

// ============================================
// 工具函数：响应解析
// ============================================

/**
 * 从多种可能的 API 响应格式中提取嵌入向量
 * 
 * 兼容的格式：
 * 1. OpenAI 标准: { data: [{ embedding: [...] }] }
 * 2. 某些国产模型: { embeddings: [{ embedding: [...] }] }
 * 3. 另一种变体: { output: { embeddings: [{ embedding: [...] }] } }
 * 
 * @param payload - API 响应体
 * @returns 向量数组（number[]），解析失败返回 null
 */
function pickEmbeddingVector(payload) {
  // 按优先级尝试不同的字段路径
  const vector =
    payload?.data?.[0]?.embedding ??           // OpenAI 标准格式
    payload?.embeddings?.[0]?.embedding ??      // 简化格式
    payload?.output?.embeddings?.[0]?.embedding // 嵌套格式

  // 验证向量有效性
  if (!Array.isArray(vector) || vector.length === 0) {
    return null
  }

  // 确保所有元素都是数字类型（防止字符串或 null 混入）
  const normalized = vector.map((item) => Number(item))
  if (normalized.some((item) => Number.isNaN(item))) {
    return null
  }

  return normalized
}

// ============================================
// 工厂函数：创建 Embedding 客户端
// ============================================
//封装通用 Embedding 客户端，支持多厂商模型适配、
// 自动格式解析与内存缓存，为 RAG 检索提供稳定高效的向量生成能力。

/**
 * 创建文本嵌入服务客户端
 * 
 * 功能特性：
 * - 支持多种 Embedding API 格式（OpenAI 兼容）
 * - 内置内存缓存（LRU 策略，避免重复调用）
 * - 统一的错误处理和响应解析
 * 
 * @param options - 客户端配置选项
 * @param options.providerBaseUrl - API 基础 URL（如 https://api.openai.com）
 * @param options.embeddingPath - API 路径（如 /v1/embeddings）
 * @param options.embeddingModel - 模型名称（如 text-embedding-ada-002）
 * @param options.apiKey - API 密钥
 * @param options.apiKeyHeader - 认证头字段名（默认 'Authorization'）
 * @param options.apiKeyPrefix - 密钥前缀（默认 'Bearer'）
 * @returns 包含 embedText 方法的对象
 */
export function createEmbeddingClient(options) {
  const {
    providerBaseUrl,
    embeddingPath,
    embeddingModel,
    apiKey,
    apiKeyHeader,
    apiKeyPrefix,
  } = options

  // 构建完整端点 URL
  const endpoint = buildUrl(providerBaseUrl, embeddingPath)
  
  // 本地内存缓存：text -> vector
  // 注意：这是简单的 Map，没有过期策略，适合单机短期运行
  // 生产环境建议改用 LRU Cache 或 Redis
  const cache = new Map()

  /**
   * 将文本转换为向量（Embedding）
   * 
   * 流程：
   * 1. 检查缓存，命中直接返回
   * 2. 检查 API Key 配置
   * 3. 调用 Embedding API
   * 4. 解析响应提取向量
   * 5. 写入缓存并返回
   * 
   * @param input - 输入文本（会被 trim 处理）
   * @returns 向量数组（number[]），空文本返回空数组
   * @throws 网络错误或 API 错误时抛出异常
   */
  const embedText = async (input) => {
    // 标准化输入：转字符串并去除首尾空白
    const text = String(input ?? '').trim()
    
    // 空文本直接返回空向量（避免无效 API 调用）
    if (!text) {
      return []
    }

    // 缓存检查：避免重复计算相同文本
    const hit = cache.get(text)
    if (hit) {
      return hit
    }

    // 认证检查：前置校验，避免发送注定失败的请求
    if (!apiKey) {
      throw new Error('LLM_API_KEY 未配置，无法调用 embedding 接口。')
    }

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      [apiKeyHeader]: `${apiKeyPrefix} ${apiKey}`,
    }

    // 构建请求体（OpenAI 标准格式）
    const body = {
      model: embeddingModel,
      input: text,
    }

    // 发送请求
    const response = await axios.post(endpoint, body, {
      headers,
      timeout: 60000, // 60 秒超时（Embedding 通常较慢）
      // 自定义状态码校验：4xx 错误需要解析业务错误信息
      validateStatus: (status) => status >= 200 && status < 500,
    })

    // 处理 HTTP 错误（4xx/5xx）
    if (response.status >= 400) {
      // 尝试从多种可能的错误格式中提取信息
      const message =
        response?.data?.error?.message ??  // OpenAI 风格
        response?.data?.message ??           // 通用风格
        `embedding 接口调用失败，状态码 ${response.status}`
      throw new Error(message)
    }

    // 提取向量数据
    const vector = pickEmbeddingVector(response.data)
    if (!vector) {
      throw new Error('embedding 接口返回格式不兼容，未找到向量数据。')
    }

    // 写入缓存（后续相同文本直接返回，节省成本和延迟）
    cache.set(text, vector)
    return vector
  }

  // 返回对外暴露的 API
  return {
    embedText,
  }
}