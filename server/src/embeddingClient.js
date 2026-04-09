import axios from 'axios'

function buildUrl(baseUrl, path) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  const cleanPath = String(path ?? '').trim().replace(/^\/+/, '')
  return `${base}/${cleanPath}`
}

function pickEmbeddingVector(payload) {
  const vector =
    payload?.data?.[0]?.embedding ??
    payload?.embeddings?.[0]?.embedding ??
    payload?.output?.embeddings?.[0]?.embedding

  if (!Array.isArray(vector) || vector.length === 0) {
    return null
  }

  const normalized = vector.map((item) => Number(item))
  if (normalized.some((item) => Number.isNaN(item))) {
    return null
  }

  return normalized
}

export function createEmbeddingClient(options) {
  const {
    providerBaseUrl,
    embeddingPath,
    embeddingModel,
    apiKey,
    apiKeyHeader,
    apiKeyPrefix,
  } = options

  const endpoint = buildUrl(providerBaseUrl, embeddingPath)
  const cache = new Map()

  const embedText = async (input) => {
    const text = String(input ?? '').trim()
    if (!text) {
      return []
    }

    const hit = cache.get(text)
    if (hit) {
      return hit
    }

    if (!apiKey) {
      throw new Error('LLM_API_KEY 未配置，无法调用 embedding 接口。')
    }

    const headers = {
      'Content-Type': 'application/json',
      [apiKeyHeader]: `${apiKeyPrefix} ${apiKey}`,
    }

    const body = {
      model: embeddingModel,
      input: text,
    }

    const response = await axios.post(endpoint, body, {
      headers,
      timeout: 60000,
      validateStatus: (status) => status >= 200 && status < 500,
    })

    if (response.status >= 400) {
      const message =
        response?.data?.error?.message ??
        response?.data?.message ??
        `embedding 接口调用失败，状态码 ${response.status}`
      throw new Error(message)
    }

    const vector = pickEmbeddingVector(response.data)
    if (!vector) {
      throw new Error('embedding 接口返回格式不兼容，未找到向量数据。')
    }

    cache.set(text, vector)
    return vector
  }

  return {
    embedText,
  }
}
