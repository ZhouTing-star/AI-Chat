import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

// ============================================
// 工具函数：编码修复与文本处理
// ============================================

/**
 * 修复可能的编码错误（Mojibake 乱码）
 * 
 * 问题场景：某些情况下 UTF-8 文本被错误地按 latin1 编码解析，
 * 导致中文显示为乱码（如 "你好" 变成 "ä½ å¥½"）
 * 
 * 检测逻辑：检查是否包含典型的 latin1 乱码字符（Ã/å/ç 等），
 * 如果是则尝试用 latin1->utf8 重新解码
 * 
 * @param input - 可能包含乱码的字符串
 * @returns 修复后的字符串
 */
function maybeDecodeLatin1Utf8(input) {
  const text = String(input ?? '')
  if (!text) {
    return text
  }

  // 常见乱码特征：UTF-8 文本被按 latin1 解读后会出现 Ã/å/ç 等字符。
  const mojibakePattern = /[ÃÂÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞãåæçèéêëìíîïðñòóôõöøùúûüýþ]/g
  const hasMojibake = mojibakePattern.test(text)
  if (!hasMojibake) {
    return text
  }

  // 尝试重新解码
  const decoded = Buffer.from(text, 'latin1').toString('utf8')
  const originalMojibakeCount = (text.match(mojibakePattern) ?? []).length
  const decodedMojibakeCount = (decoded.match(mojibakePattern) ?? []).length

  // 如果解码后乱码字符减少，说明修复成功
  if (decodedMojibakeCount < originalMojibakeCount) {
    return decoded
  }

  // 如果解码后出现中文字符而原文没有，说明修复成功
  const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded)
  const originHasCjk = /[\u4e00-\u9fff]/.test(text)
  if (decodedHasCjk && !originHasCjk) {
    return decoded
  }

  return text
}

/**
 * 规范化来源标签显示
 * 将 "filename.pdf / chunk 5" 转换为更友好的显示格式
 * 
 * @param source - 原始来源标识
 * @param docName - 文档名称
 * @returns 格式化后的来源标签
 */
function normalizeSourceLabel(source, docName) {
  const safeDocName = maybeDecodeLatin1Utf8(docName)
  const sourceText = String(source ?? '')
  const suffix = sourceText.match(/(\d+)\s*$/)

  if (safeDocName && suffix?.[1]) {
    return `${safeDocName} / 分块 ${suffix[1]}`
  }

  return maybeDecodeLatin1Utf8(sourceText)
}

/**
 * 计算两个向量的余弦相似度
 * 用于语义检索时比较查询向量与文档块向量的相似程度
 * 
 * @param a - 向量 A
 * @param b - 向量 B
 * @returns 相似度分数（0-1 之间，1 表示完全相同）
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return 0
  }

  const size = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < size; i += 1) {
    const va = Number(a[i])
    const vb = Number(b[i])
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA <= 0 || normB <= 0) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 将数据库行转换为对外暴露的知识库对象
 * 屏蔽内部字段，统一 API 格式
 */
function toPublicKnowledgeBase(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    docs: row.docs,
    chunks: row.chunks,
    updatedAt: row.updated_at,
    storageUsed: row.storage_used,
    storageTotal: row.storage_total,
    embeddingModel: row.embedding_model,
    embeddingDims: row.embedding_dims,
    indexJobs: row.index_jobs,
    isActive: Boolean(row.is_active),
    engineVersion: row.engine_version,
    lastRebuildAt: row.last_rebuild_at,
  }
}

/**
 * 将数据库行转换为对外暴露的文档对象
 * 同时处理文件名编码问题
 */
function toPublicDocument(row) {
  return {
    id: row.id,
    kbId: row.kb_id,
    name: maybeDecodeLatin1Utf8(row.name),
    size: row.size,
    chunks: row.chunks,
    updatedAt: row.updated_at,
    isActive: Boolean(row.is_active),
  }
}

/**
 * 将用户查询转换为 FTS5 支持的 MATCH 查询语法
 * 
 * 转换示例：
 * "hello world" -> "hello* OR world*"
 * 
 * 原理：将空格分隔的每个词后加 * 表示前缀匹配，并用 OR 连接
 * 
 * @param query - 用户输入的查询词
 * @returns FTS5 查询字符串
 */
function normalizeMatchQuery(query) {
  return String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(' OR ')
}

/**
 * 格式化文件大小显示
 * 自动选择合适的单位（B/KB/MB）
 * 
 * @param bytes - 字节数
 * @returns 人类可读的大小字符串
 */
function formatSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 智能文本分块
 * 
 * 策略：
 * 1. 先按句子边界（。！？.!?\n）分割文本
 * 2. 动态合并句子成块，尽量接近目标大小（chunkSize）
 * 3. 块之间设置重叠区域（overlap），保证语义连贯性
 * 
 * @param text - 原始长文本
 * @param options - 分块配置（chunkSize 默认 420，overlap 默认 80）
 * @returns 文本块数组
 */
function splitTextIntoChunks(text, options = {}) {
  const chunkSize = options.chunkSize ?? 420
  const overlap = options.overlap ?? 80
  
  // 标准化换行符，合并多个连续换行
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    return []
  }

  // 按句子边界分割
  const segments = normalized
    .split(/(?<=[。！？.!?\n])/)  // 正向肯定查找，保留分隔符
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks = []
  let cursor = 0

  while (cursor < segments.length) {
    let buffer = ''
    let nextCursor = cursor

    // 合并句子直到接近 chunkSize
    while (nextCursor < segments.length) {
      const candidate = `${buffer}${buffer ? ' ' : ''}${segments[nextCursor]}`
      if (candidate.length > chunkSize && buffer) {
        break
      }
      buffer = candidate
      nextCursor += 1
      if (buffer.length >= chunkSize) {
        break
      }
    }

    // 处理超长单个句子的情况（强制截断）
    if (!buffer) {
      buffer = segments[cursor].slice(0, chunkSize)
      nextCursor = cursor + 1
    }

    chunks.push(buffer.trim())
    if (nextCursor >= segments.length) {
      break
    }

    // 计算重叠文本，保证上下文连贯
    const overlapText = buffer.slice(-overlap)
    cursor = nextCursor

    // 将重叠文本合并到下一块开头
    if (overlapText.trim()) {
      segments[cursor] = `${overlapText} ${segments[cursor]}`.trim()
    }
  }

  return chunks.filter(Boolean)
}

/**
 * 规范化检索模式参数
 * 
 * 支持模式：
 * - strict: 严格匹配（高相似度阈值 0.7）
 * - balanced: 平衡模式（默认，阈值 0.4）
 * - general: 宽泛模式（低阈值）
 * - vector: 纯向量检索
 * - hybrid: 混合检索（向量+关键词）
 * - off: 关闭检索
 * 
 * @param rawMode - 原始模式字符串
 * @returns 标准化后的模式标识
 */
function normalizeSearchMode(rawMode) {
  const mode = String(rawMode ?? '').trim().toLowerCase()

  if (
    mode === 'strict' ||
    mode === 'balanced' ||
    mode === 'general' ||
    mode === 'vector' ||
    mode === 'hybrid' ||
    mode === 'off'
  ) {
    return mode
  }

  return 'balanced'
}

// ============================================
// 核心工厂函数：创建 RAG 存储实例
// ============================================

/**
 * 创建 RAG 知识库存储实例
 * 封装 SQLite 数据库操作、向量检索、文档管理等功能
 * 
 * @param options - 配置选项
 * @param options.dbFilePath - SQLite 数据库文件路径
 * @param options.embedText - 文本向量化函数（异步，接收文本返回向量数组）
 * @param options.embeddingModelName - 嵌入模型名称（默认 'embedding-3'）
 * @param options.embeddingDims - 向量维度（默认 0，自动推断）
 * @param options.storageTotal - 存储空间上限显示（默认 '1 GB'）
 * @returns RAG 存储操作对象
 */
export function createRagStore(options) {
  const {
    dbFilePath,
    embedText,
    embeddingModelName = 'embedding-3',
    embeddingDims = 0,
    storageTotal = '1 GB',
  } = options

  // 确保数据库目录存在
  const dbAbsolutePath = path.resolve(dbFilePath)
  fs.mkdirSync(path.dirname(dbAbsolutePath), { recursive: true })

  // 初始化 better-sqlite3 连接
  const db = new Database(dbAbsolutePath)
  
  // WAL 模式：提高并发写入性能
  db.pragma('journal_mode = WAL')
  // 外键约束：保证数据一致性
  db.pragma('foreign_keys = ON')

  // ==========================================
  // 数据库表结构初始化
  // ==========================================
  
  // knowledge_bases: 知识库主表
  // documents: 文档表（归属知识库）
  // chunks: 文本块表（归属文档，存储向量和原文）
  // chunk_fts: FTS5 虚拟表（全文检索索引）
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      storage_used TEXT NOT NULL,
      storage_total TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dims INTEGER NOT NULL,
      index_jobs INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      engine_version INTEGER NOT NULL DEFAULT 1,
      last_rebuild_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      chunks INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      vector_json TEXT,
      FOREIGN KEY(kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
      chunk_id UNINDEXED,
      kb_id UNINDEXED,
      doc_id UNINDEXED,
      source,
      content
    );
  `)

  // ==========================================
  // 预编译 SQL 语句（性能优化）
  // ==========================================
  
  // 查询所有知识库（包含文档和块数量统计）
  const listKbsStmt = db.prepare(`
    SELECT
      kb.*,
      COUNT(DISTINCT d.id) AS docs,
      COALESCE(SUM(d.chunks), 0) AS chunks
    FROM knowledge_bases kb
    LEFT JOIN documents d ON d.kb_id = kb.id
    GROUP BY kb.id
    ORDER BY kb.id ASC
  `)

  // 单知识库查询
  const kbByIdStmt = db.prepare('SELECT * FROM knowledge_bases WHERE id = ?')
  
  // 查询知识库下的所有文档
  const docsByKbStmt = db.prepare('SELECT * FROM documents WHERE kb_id = ? ORDER BY id ASC')
  
  // 单文档查询
  const docByIdStmt = db.prepare('SELECT * FROM documents WHERE id = ?')

  // 插入知识库
  const insertKbStmt = db.prepare(`
    INSERT INTO knowledge_bases (
      id, name, status, updated_at, storage_used, storage_total,
      embedding_model, embedding_dims, index_jobs, is_active, engine_version, last_rebuild_at
    ) VALUES (
      @id, @name, @status, @updatedAt, @storageUsed, @storageTotal,
      @embeddingModel, @embeddingDims, @indexJobs, @isActive, @engineVersion, @lastRebuildAt
    )
  `)

  // 插入文档
  const insertDocStmt = db.prepare(`
    INSERT INTO documents (
      id, kb_id, name, size, chunks, updated_at, is_active
    ) VALUES (
      @id, @kbId, @name, @size, @chunks, @updatedAt, @isActive
    )
  `)

  // 插入文本块
  const insertChunkStmt = db.prepare(`
    INSERT INTO chunks (
      id, kb_id, doc_id, source, content, vector_json
    ) VALUES (
      @id, @kbId, @docId, @source, @content, @vectorJson
    )
  `)

  // 插入 FTS 索引
  const insertFtsStmt = db.prepare(`
    INSERT INTO chunk_fts (chunk_id, kb_id, doc_id, source, content)
    VALUES (@chunkId, @kbId, @docId, @source, @content)
  `)

  // 查询用于向量检索的块（仅活跃文档）
  const chunksForVectorStmt = db.prepare(`
    SELECT c.id, c.kb_id, c.doc_id, c.source, c.content, c.vector_json
    FROM chunks c
    INNER JOIN documents d ON d.id = c.doc_id
    WHERE c.kb_id = ? AND d.is_active = 1
  `)

  // ==========================================
  // 知识库管理 API
  // ==========================================

  /**
   * 列出所有知识库
   * @returns 知识库对象数组
   */
  function listKnowledgeBases() {
    return listKbsStmt.all().map(toPublicKnowledgeBase)
  }

  /**
   * 列出指定知识库的所有文档
   * @param kbId - 知识库 ID
   * @returns 文档对象数组，或 null（知识库不存在）
   */
  function listKnowledgeBaseDocuments(kbId) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    return docsByKbStmt.all(kbId).map(toPublicDocument)
  }

  /**
   * 创建新知识库
   * 
   * @param name - 知识库名称（必填，最多 60 字符）
   * @param nowLabel - 当前时间标签（用于显示）
   * @returns 创建后的知识库对象
   */
  function createKnowledgeBase(name, nowLabel) {
    const trimmedName = String(name ?? '').trim()
    if (!trimmedName) {
      throw new Error('知识库名称不能为空。')
    }
    if (trimmedName.length > 60) {
      throw new Error('知识库名称过长，请控制在 60 个字符以内。')
    }

    const kbId = `kb-${randomUUID()}`
    const updatedAt = `今天 ${String(nowLabel).slice(0, 5)}`

    insertKbStmt.run({
      id: kbId,
      name: trimmedName,
      status: '健康',
      updatedAt,
      storageUsed: '0 B',
      storageTotal,
      embeddingModel: embeddingModelName,
      embeddingDims: Number(embeddingDims) || 0,
      indexJobs: 0,
      isActive: 1,
      engineVersion: 1,
      lastRebuildAt: '',
    })

    const created = listKbsStmt.all().find((item) => item.id === kbId)
    return created ? toPublicKnowledgeBase(created) : null
  }

  /**
   * 切换知识库启用/停用状态
   * 停用后该知识库不会参与检索
   * 
   * @param kbId - 知识库 ID
   * @param nowLabel - 当前时间标签
   * @returns 更新后的知识库对象，或 null（不存在）
   */
  function toggleKnowledgeBaseActive(kbId, nowLabel) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    db.prepare(`
      UPDATE knowledge_bases
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = ?
      WHERE id = ?
    `).run(`今天 ${String(nowLabel).slice(0, 5)}`, kbId)

    const updated = listKbsStmt.all().find((item) => item.id === kbId)
    return updated ? toPublicKnowledgeBase(updated) : null
  }

  /**
   * 切换文档启用/停用状态
   * 停用后该文档不会参与检索
   * 
   * @param docId - 文档 ID
   * @param nowLabel - 当前时间标签
   * @returns 更新后的文档对象，或 null（不存在）
   */
  function toggleDocumentActive(docId, nowLabel) {
    const doc = docByIdStmt.get(docId)
    if (!doc) {
      return null
    }

    db.prepare(`
      UPDATE documents
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = ?
      WHERE id = ?
    `).run(`今天 ${String(nowLabel).slice(0, 5)}`, docId)

    return toPublicDocument(docByIdStmt.get(docId))
  }

  /**
   * 删除文档及其所有关联数据
   * 级联删除：chunks 表数据、FTS 索引数据
   * 
   * @param docId - 文档 ID
   * @returns 被删除的文档对象，或 null（不存在）
   */
  function deleteDocument(docId) {
    const doc = docByIdStmt.get(docId)
    if (!doc) {
      return null
    }

    // 事务包装：保证原子性
    const tx = db.transaction(() => {
      // 删除 FTS 索引
      db.prepare('DELETE FROM chunk_fts WHERE doc_id = ?').run(docId)
      // 删除文本块
      db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId)
      // 删除文档记录
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
      // 更新知识库版本号（触发检索缓存失效）
      db.prepare(`
        UPDATE knowledge_bases
        SET updated_at = ?,
            engine_version = engine_version + 1
        WHERE id = ?
      `).run(`今天 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`, doc.kb_id)
    })

    tx()
    return toPublicDocument(doc)
  }

  /**
   * 重建知识库向量索引
   * 场景：更换嵌入模型后需要重新计算所有文本块的向量
   * 
   * @param kbId - 知识库 ID
   * @param nowLabel - 当前时间标签
   * @returns 更新后的知识库对象，或 null（不存在）
   */
  async function rebuildKnowledgeBase(kbId, nowLabel) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    // 标记为索引中状态
    db.prepare('UPDATE knowledge_bases SET status = ?, index_jobs = ? WHERE id = ?').run('索引中', 1, kbId)

    // 获取所有文本块
    const chunks = db.prepare('SELECT id, content FROM chunks WHERE kb_id = ?').all(kbId)
    const updateVector = db.prepare('UPDATE chunks SET vector_json = ? WHERE id = ?')

    // 逐个计算向量并更新（可优化为批量处理）
    for (const chunk of chunks) {
      const vector = await embedText(chunk.content)
      updateVector.run(JSON.stringify(vector), chunk.id)
    }

    // 更新知识库状态
    db.prepare(`
      UPDATE knowledge_bases
      SET status = ?,
          updated_at = ?,
          last_rebuild_at = ?,
          index_jobs = 0,
          engine_version = engine_version + 1
      WHERE id = ?
    `).run('健康', `今天 ${String(nowLabel).slice(0, 5)}`, nowLabel, kbId)

    const updated = listKbsStmt.all().find((item) => item.id === kbId)
    return updated ? toPublicKnowledgeBase(updated) : null
  }

  /**
   * 文档入库处理
   * 流程：分块 -> 向量化 -> 写入数据库 -> 更新 FTS 索引
   * 
   * @param kbId - 目标知识库 ID
   * @param fileName - 原始文件名
   * @param fileSize - 文件大小（字节）
   * @param plainText - 提取的纯文本内容
   * @param nowLabel - 当前时间标签
   * @returns 入库结果：{ documentId, chunks }
   */
  async function ingestDocument(kbId, fileName, fileSize, plainText, nowLabel) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    // 文本分块
    const chunks = splitTextIntoChunks(plainText)
    if (chunks.length === 0) {
      throw new Error('文档解析后为空，无法入库。')
    }

    const docId = randomUUID()
    const updatedAt = `今天 ${String(nowLabel).slice(0, 5)}`

    // 预计算所有块的向量（允许部分失败）
    const vectors = []
    for (const chunk of chunks) {
      try {
        const vector = await embedText(chunk)
        vectors.push(Array.isArray(vector) && vector.length > 0 ? vector : null)
      } catch {
        // embedding 失败时仍允许入库，后续可通过重建索引补齐向量。
        vectors.push(null)
      }
    }

    // 事务写入所有数据
    const tx = db.transaction(() => {
      // 插入文档记录
      insertDocStmt.run({
        id: docId,
        kbId,
        name: fileName,
        size: formatSize(fileSize),
        chunks: chunks.length,
        updatedAt,
        isActive: 1,
      })

      // 插入每个文本块及其 FTS 索引
      chunks.forEach((chunk, index) => {
        const chunkId = randomUUID()
        const source = `${fileName} / 分块 ${index + 1}`
        const vectorJson = vectors[index] ? JSON.stringify(vectors[index]) : null

        insertChunkStmt.run({
          id: chunkId,
          kbId,
          docId,
          source,
          content: chunk,
          vectorJson,
        })

        insertFtsStmt.run({
          chunkId,
          kbId,
          docId,
          source,
          content: chunk,
        })
      })

      // 更新知识库元数据
      db.prepare(`
        UPDATE knowledge_bases
        SET updated_at = ?,
            status = '健康',
            index_jobs = 0,
            engine_version = engine_version + 1,
            last_rebuild_at = ?
        WHERE id = ?
      `).run(updatedAt, nowLabel, kbId)
    })

    tx()

    return {
      documentId: docId,
      chunks: chunks.length,
    }
  }

  /**
   * 混合检索（核心功能）
   * 支持多种检索模式：向量检索、关键词检索、混合检索
   * 
   * 混合检索评分公式：
   * score = vectorScore * 0.72 + keywordScore * 0.28
   * 
   * @param kbId - 知识库 ID
   * @param query - 查询文本
   * @param topK - 返回结果数量（默认 5，最大 8）
   * @param mode - 检索模式（strict/balanced/general/vector/hybrid/off）
   * @param docIdWhitelist - 限定检索的文档 ID 列表（可选，用于附件检索场景）
   * @returns 检索结果数组，按相似度降序排列
   */
  async function search(kbId, query, topK, mode = 'balanced', docIdWhitelist = []) {
    const normalizedTopK = Math.max(1, Math.min(Number(topK) || 5, 8))
    const queryText = String(query ?? '').trim()
    const normalizedMode = normalizeSearchMode(mode)
    const isVectorOnly = normalizedMode === 'vector'
    const useHybrid = normalizedMode === 'hybrid' || normalizedMode === 'balanced' || normalizedMode === 'strict'

    // 根据模式设置最低相似度阈值
    const minScore =
      normalizedMode === 'strict'
        ? 0.7
        : normalizedMode === 'balanced'
          ? 0.4
          : 0

    // 模式为 off 或 general（纯关键词，但这里直接返回空）时提前返回
    if (!queryText || normalizedMode === 'off' || normalizedMode === 'general') {
      return []
    }

    // 检查知识库存在且启用
    const kb = kbByIdStmt.get(kbId)
    if (!kb || kb.is_active !== 1) {
      return []
    }

    // 构建白名单集合（如果提供）
    const whitelist = Array.isArray(docIdWhitelist)
      ? new Set(docIdWhitelist.map((item) => String(item ?? '').trim()).filter(Boolean))
      : new Set()

    // 获取所有活跃文档
    const activeDocs = docsByKbStmt
      .all(kbId)
      .filter((item) => item.is_active === 1)
      .filter((item) => whitelist.size === 0 || whitelist.has(item.id))

    if (activeDocs.length === 0) {
      return []
    }

    // 评分容器：key 为 chunkId，value 为评分对象
    const scores = new Map()
    const activeDocIds = activeDocs.map((item) => item.id)
    const activeDocIdSet = new Set(activeDocIds)
    
    // 构建文档 ID -> 名称映射（用于结果展示）
    const activeDocNameById = new Map(
      activeDocs.map((item) => [item.id, item.name]),
    )

    // ========== 向量检索阶段 ==========
    if (isVectorOnly || useHybrid) {
      let queryVector = []
      try {
        queryVector = await embedText(queryText)
      } catch {
        queryVector = []
      }

      // 获取候选块（仅来自活跃文档）
      const vectorCandidates = chunksForVectorStmt
        .all(kbId)
        .filter((item) => activeDocIdSet.has(item.doc_id))

      // 纯向量模式但向量化失败时返回空
      if (queryVector.length === 0 && isVectorOnly) {
        return []
      }

      // 计算余弦相似度
      vectorCandidates.forEach((item) => {
        if (queryVector.length === 0) {
          return
        }

        if (!item.vector_json) {
          return
        }

        let vector = null
        try {
          vector = JSON.parse(item.vector_json)
        } catch {
          vector = null
        }

        if (!Array.isArray(vector)) {
          return
        }

        const vectorScore = cosineSimilarity(queryVector, vector)
        const record = scores.get(item.id) ?? {
          id: item.id,
          kbId: item.kb_id,
          docId: item.doc_id,
          source: item.source,
          content: item.content,
          vectorScore: 0,
          keywordScore: 0,
        }

        record.vectorScore = vectorScore
        scores.set(item.id, record)
      })
    }

    // ========== 关键词检索阶段（FTS5） ==========
    if (useHybrid) {
      const matchQuery = normalizeMatchQuery(queryText)
      if (matchQuery) {
        try {
          // 手动转义防止 SQL 注入（FTS5 查询参数化较复杂）
          const escapedKbId = kbId.replace(/'/g, "''")
          const escapedDocIds = activeDocIds
            .map((id) => `'${id.replace(/'/g, "''")}'`)
            .join(',')
          const escapedMatchQuery = matchQuery.replace(/'/g, "''")
          const keywordLimit = normalizedTopK * 4  // 扩大候选集
          
          // FTS5 查询：使用 BM25 排序
          const ftsSql = `
            SELECT chunk_id, bm25(chunk_fts) AS rank
            FROM chunk_fts
            WHERE kb_id = '${escapedKbId}'
              AND doc_id IN (${escapedDocIds})
              AND chunk_fts MATCH '${escapedMatchQuery}'
            ORDER BY rank ASC
            LIMIT ${keywordLimit}
          `

          const rows = db.prepare(ftsSql).all()
          const chunkById = db.prepare('SELECT id, kb_id, doc_id, source, content FROM chunks WHERE id = ?')

          rows.forEach((item) => {
            // BM25 分数越小相关性越高，转换为 0-1 分数
            const keywordScore = 1 / (1 + Math.max(0, Number(item.rank) || 0))
            const chunk = chunkById.get(item.chunk_id)
            if (!chunk) {
              return
            }

            const record = scores.get(chunk.id) ?? {
              id: chunk.id,
              kbId: chunk.kb_id,
              docId: chunk.doc_id,
              source: chunk.source,
              content: chunk.content,
              vectorScore: 0,
              keywordScore: 0,
            }

            record.keywordScore = Math.max(record.keywordScore, keywordScore)
            scores.set(chunk.id, record)
          })
        } catch {
          // FTS5 失败时回退到简单字符串匹配
          const fallbackChunks = chunksForVectorStmt
            .all(kbId)
            .filter((chunk) => activeDocIdSet.has(chunk.doc_id))
          const tokens = queryText.toLowerCase().split(/\s+/).filter(Boolean)

          fallbackChunks.forEach((chunk) => {
            const text = `${chunk.source} ${chunk.content}`.toLowerCase()
            const hit = tokens.filter((token) => text.includes(token)).length
            const keywordScore = tokens.length > 0 ? hit / tokens.length : 0

            const record = scores.get(chunk.id) ?? {
              id: chunk.id,
              kbId: chunk.kb_id,
              docId: chunk.doc_id,
              source: chunk.source,
              content: chunk.content,
              vectorScore: 0,
              keywordScore: 0,
            }

            record.keywordScore = Math.max(record.keywordScore, keywordScore)
            scores.set(chunk.id, record)
          })
        }
      }
    }

    // ========== 结果排序与格式化 ==========
    const ranked = Array.from(scores.values())
      .map((item) => {
        // 混合评分：向量权重 0.72，关键词权重 0.28
        const score =
          isVectorOnly
            ? item.vectorScore
            : item.vectorScore * 0.72 + item.keywordScore * 0.28

        return {
          id: item.id,
          kbId: item.kbId,
          docId: item.docId,
          source: normalizeSourceLabel(item.source, activeDocNameById.get(item.docId)),
          content: item.content,
          score,
        }
      })
      .filter((item) => item.score >= minScore)  // 阈值过滤
      .sort((a, b) => b.score - a.score)         // 降序排列
      .slice(0, normalizedTopK)                   // 截取 TopK

    // ========== 兜底策略 ==========
    // 在会话附件限定场景中，若平衡模式检索分数都不达标，
    // 兜底返回附件正文片段，避免出现“无法访问文档”的错误体验。
    if (ranked.length === 0 && normalizedMode === 'balanced' && whitelist.size > 0) {
      const escapedKbId = kbId.replace(/'/g, "''")
      const escapedDocIds = activeDocIds
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(',')
      const fallbackSql = `
        SELECT id, kb_id, doc_id, source, content
        FROM chunks
        WHERE kb_id = '${escapedKbId}'
          AND doc_id IN (${escapedDocIds})
        ORDER BY id ASC
        LIMIT ${normalizedTopK}
      `

      const fallback = db.prepare(fallbackSql).all().map((item) => ({
        id: item.id,
        kbId: item.kb_id,
        docId: item.doc_id,
        source: normalizeSourceLabel(item.source, activeDocNameById.get(item.doc_id)),
        content: item.content,
        score: 0.41,  // 赋予保底分数
      }))

      if (fallback.length > 0) {
        return fallback
      }
    }

    return ranked
  }

  // 返回对外 API
  return {
    listKnowledgeBases,
    listKnowledgeBaseDocuments,
    createKnowledgeBase,
    toggleKnowledgeBaseActive,
    toggleDocumentActive,
    deleteDocument,
    rebuildKnowledgeBase,
    ingestDocument,
    search,
  }
}