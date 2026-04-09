import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

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

  const decoded = Buffer.from(text, 'latin1').toString('utf8')
  const originalMojibakeCount = (text.match(mojibakePattern) ?? []).length
  const decodedMojibakeCount = (decoded.match(mojibakePattern) ?? []).length

  if (decodedMojibakeCount < originalMojibakeCount) {
    return decoded
  }

  const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded)
  const originHasCjk = /[\u4e00-\u9fff]/.test(text)
  if (decodedHasCjk && !originHasCjk) {
    return decoded
  }

  return text
}

function normalizeSourceLabel(source, docName) {
  const safeDocName = maybeDecodeLatin1Utf8(docName)
  const sourceText = String(source ?? '')
  const suffix = sourceText.match(/(\d+)\s*$/)

  if (safeDocName && suffix?.[1]) {
    return `${safeDocName} / 分块 ${suffix[1]}`
  }

  return maybeDecodeLatin1Utf8(sourceText)
}

const seedKnowledgeBases = [
  {
    id: 'kb-default',
    name: '默认知识库',
    status: '健康',
    updatedAt: '今天 10:12',
    storageUsed: '156MB',
    storageTotal: '1GB',
    embeddingModel: 'MiniLM-L6',
    embeddingDims: 384,
    indexJobs: 2,
    isActive: 1,
    engineVersion: 1,
    lastRebuildAt: '',
  },
  {
    id: 'kb-product',
    name: '产品文档库',
    status: '索引中',
    updatedAt: '昨天 18:05',
    storageUsed: '81MB',
    storageTotal: '1GB',
    embeddingModel: 'BGE-Small-ZH',
    embeddingDims: 512,
    indexJobs: 1,
    isActive: 1,
    engineVersion: 1,
    lastRebuildAt: '',
  },
]

const seedDocuments = [
  {
    id: 'doc-1',
    kbId: 'kb-default',
    name: '接入手册-v3.pdf',
    size: '3.2 MB',
    chunks: 86,
    updatedAt: '今天 09:50',
    isActive: 1,
  },
  {
    id: 'doc-2',
    kbId: 'kb-default',
    name: 'FAQ-售后策略.md',
    size: '48 KB',
    chunks: 14,
    updatedAt: '今天 09:20',
    isActive: 0,
  },
  {
    id: 'doc-3',
    kbId: 'kb-default',
    name: '知识抽取规则.txt',
    size: '12 KB',
    chunks: 6,
    updatedAt: '昨天 20:14',
    isActive: 1,
  },
  {
    id: 'doc-4',
    kbId: 'kb-product',
    name: '产品需求总览.md',
    size: '72 KB',
    chunks: 22,
    updatedAt: '昨天 17:10',
    isActive: 1,
  },
  {
    id: 'doc-5',
    kbId: 'kb-product',
    name: '版本发布说明-2026Q1.pdf',
    size: '1.8 MB',
    chunks: 41,
    updatedAt: '昨天 16:40',
    isActive: 1,
  },
]

const seedChunks = [
  {
    id: 'chunk-1',
    kbId: 'kb-default',
    docId: 'doc-1',
    source: '接入手册-v3.pdf / 第2章',
    content: '鉴权失败时应先检查 access_token 过期时间，再校验时钟偏移与签名算法。',
  },
  {
    id: 'chunk-2',
    kbId: 'kb-default',
    docId: 'doc-1',
    source: '接入手册-v3.pdf / 第5章',
    content: '流式接口采用 event-stream 协议，需处理 delta 与 done 两类事件。',
  },
  {
    id: 'chunk-3',
    kbId: 'kb-default',
    docId: 'doc-2',
    source: 'FAQ-售后策略.md / 条款3',
    content: '普通故障工单响应时限为 2 小时，严重故障需在 30 分钟内确认。',
  },
  {
    id: 'chunk-4',
    kbId: 'kb-default',
    docId: 'doc-3',
    source: '知识抽取规则.txt / 模板A',
    content: '切片建议长度 400 到 800 字，重叠区间建议在 80 到 120 字。',
  },
  {
    id: 'chunk-5',
    kbId: 'kb-product',
    docId: 'doc-4',
    source: '产品需求总览.md / 路线图',
    content: '2026 年重点升级知识检索链路，目标将召回准确率提升 12%。',
  },
  {
    id: 'chunk-6',
    kbId: 'kb-product',
    docId: 'doc-5',
    source: '版本发布说明-2026Q1.pdf / 修复项',
    content: '修复多会话场景下上下文拼接偶发重复问题，并优化暂停恢复流程。',
  },
]

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

function normalizeMatchQuery(query) {
  return String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(' OR ')
}

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

function splitTextIntoChunks(text, options = {}) {
  const chunkSize = options.chunkSize ?? 420
  const overlap = options.overlap ?? 80
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    return []
  }

  const segments = normalized
    .split(/(?<=[。！？.!?\n])/)
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks = []
  let cursor = 0

  while (cursor < segments.length) {
    let buffer = ''
    let nextCursor = cursor

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

    if (!buffer) {
      buffer = segments[cursor].slice(0, chunkSize)
      nextCursor = cursor + 1
    }

    chunks.push(buffer.trim())
    if (nextCursor >= segments.length) {
      break
    }

    const overlapText = buffer.slice(-overlap)
    cursor = nextCursor

    if (overlapText.trim()) {
      segments[cursor] = `${overlapText} ${segments[cursor]}`.trim()
    }
  }

  return chunks.filter(Boolean)
}

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

export function createRagStore(options) {
  const {
    dbFilePath,
    embedText,
  } = options

  const dbAbsolutePath = path.resolve(dbFilePath)
  fs.mkdirSync(path.dirname(dbAbsolutePath), { recursive: true })

  const db = new Database(dbAbsolutePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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

  const kbCount = db.prepare('SELECT COUNT(*) AS count FROM knowledge_bases').get().count
  if (kbCount === 0) {
    const insertKb = db.prepare(`
      INSERT INTO knowledge_bases (
        id, name, status, updated_at, storage_used, storage_total,
        embedding_model, embedding_dims, index_jobs, is_active, engine_version, last_rebuild_at
      ) VALUES (
        @id, @name, @status, @updatedAt, @storageUsed, @storageTotal,
        @embeddingModel, @embeddingDims, @indexJobs, @isActive, @engineVersion, @lastRebuildAt
      )
    `)

    const insertDoc = db.prepare(`
      INSERT INTO documents (
        id, kb_id, name, size, chunks, updated_at, is_active
      ) VALUES (
        @id, @kbId, @name, @size, @chunks, @updatedAt, @isActive
      )
    `)

    const insertChunk = db.prepare(`
      INSERT INTO chunks (
        id, kb_id, doc_id, source, content, vector_json
      ) VALUES (
        @id, @kbId, @docId, @source, @content, NULL
      )
    `)

    const insertFts = db.prepare(`
      INSERT INTO chunk_fts (chunk_id, kb_id, doc_id, source, content)
      VALUES (@id, @kbId, @docId, @source, @content)
    `)

    const tx = db.transaction(() => {
      seedKnowledgeBases.forEach((item) => insertKb.run(item))
      seedDocuments.forEach((item) => insertDoc.run(item))
      seedChunks.forEach((item) => {
        insertChunk.run(item)
        insertFts.run(item)
      })
    })

    tx()
  }

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

  const kbByIdStmt = db.prepare('SELECT * FROM knowledge_bases WHERE id = ?')
  const docsByKbStmt = db.prepare('SELECT * FROM documents WHERE kb_id = ? ORDER BY id ASC')
  const docByIdStmt = db.prepare('SELECT * FROM documents WHERE id = ?')
  const insertDocStmt = db.prepare(`
    INSERT INTO documents (
      id, kb_id, name, size, chunks, updated_at, is_active
    ) VALUES (
      @id, @kbId, @name, @size, @chunks, @updatedAt, @isActive
    )
  `)
  const insertChunkStmt = db.prepare(`
    INSERT INTO chunks (
      id, kb_id, doc_id, source, content, vector_json
    ) VALUES (
      @id, @kbId, @docId, @source, @content, @vectorJson
    )
  `)
  const insertFtsStmt = db.prepare(`
    INSERT INTO chunk_fts (chunk_id, kb_id, doc_id, source, content)
    VALUES (@chunkId, @kbId, @docId, @source, @content)
  `)
  const chunksForVectorStmt = db.prepare(`
    SELECT c.id, c.kb_id, c.doc_id, c.source, c.content, c.vector_json
    FROM chunks c
    INNER JOIN documents d ON d.id = c.doc_id
    WHERE c.kb_id = ? AND d.is_active = 1
  `)

  function listKnowledgeBases() {
    return listKbsStmt.all().map(toPublicKnowledgeBase)
  }

  function listKnowledgeBaseDocuments(kbId) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    return docsByKbStmt.all(kbId).map(toPublicDocument)
  }

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

  function deleteDocument(docId) {
    const doc = docByIdStmt.get(docId)
    if (!doc) {
      return null
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM chunk_fts WHERE doc_id = ?').run(docId)
      db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId)
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId)
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

  async function rebuildKnowledgeBase(kbId, nowLabel) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    db.prepare('UPDATE knowledge_bases SET status = ?, index_jobs = ? WHERE id = ?').run('索引中', 1, kbId)

    const chunks = db.prepare('SELECT id, content FROM chunks WHERE kb_id = ?').all(kbId)
    const updateVector = db.prepare('UPDATE chunks SET vector_json = ? WHERE id = ?')

    for (const chunk of chunks) {
      const vector = await embedText(chunk.content)
      updateVector.run(JSON.stringify(vector), chunk.id)
    }

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

  async function ingestDocument(kbId, fileName, fileSize, plainText, nowLabel) {
    const kb = kbByIdStmt.get(kbId)
    if (!kb) {
      return null
    }

    const chunks = splitTextIntoChunks(plainText)
    if (chunks.length === 0) {
      throw new Error('文档解析后为空，无法入库。')
    }

    const docId = randomUUID()
    const updatedAt = `今天 ${String(nowLabel).slice(0, 5)}`

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

    const tx = db.transaction(() => {
      insertDocStmt.run({
        id: docId,
        kbId,
        name: fileName,
        size: formatSize(fileSize),
        chunks: chunks.length,
        updatedAt,
        isActive: 1,
      })

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

  async function search(kbId, query, topK, mode = 'balanced', docIdWhitelist = []) {
    const normalizedTopK = Math.max(1, Math.min(Number(topK) || 5, 8))
    const queryText = String(query ?? '').trim()
    const normalizedMode = normalizeSearchMode(mode)
    const isVectorOnly = normalizedMode === 'vector'
    const useHybrid = normalizedMode === 'hybrid' || normalizedMode === 'balanced' || normalizedMode === 'strict'

    const minScore =
      normalizedMode === 'strict'
        ? 0.7
        : normalizedMode === 'balanced'
          ? 0.4
          : 0

    if (!queryText || normalizedMode === 'off' || normalizedMode === 'general') {
      return []
    }

    const kb = kbByIdStmt.get(kbId)
    if (!kb || kb.is_active !== 1) {
      return []
    }

    const whitelist = Array.isArray(docIdWhitelist)
      ? new Set(docIdWhitelist.map((item) => String(item ?? '').trim()).filter(Boolean))
      : new Set()

    const activeDocs = docsByKbStmt
      .all(kbId)
      .filter((item) => item.is_active === 1)
      .filter((item) => whitelist.size === 0 || whitelist.has(item.id))

    if (activeDocs.length === 0) {
      return []
    }

    const scores = new Map()
    const activeDocIds = activeDocs.map((item) => item.id)
    const activeDocIdSet = new Set(activeDocIds)
    const activeDocNameById = new Map(
      activeDocs.map((item) => [item.id, item.name]),
    )

    if (isVectorOnly || useHybrid) {
      let queryVector = []
      try {
        queryVector = await embedText(queryText)
      } catch {
        queryVector = []
      }

      const vectorCandidates = chunksForVectorStmt
        .all(kbId)
        .filter((item) => activeDocIdSet.has(item.doc_id))

      if (queryVector.length === 0 && isVectorOnly) {
        return []
      }

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

    if (useHybrid) {
      const matchQuery = normalizeMatchQuery(queryText)
      if (matchQuery) {
        try {
          const escapedKbId = kbId.replace(/'/g, "''")
          const escapedDocIds = activeDocIds
            .map((id) => `'${id.replace(/'/g, "''")}'`)
            .join(',')
          const escapedMatchQuery = matchQuery.replace(/'/g, "''")
          const keywordLimit = normalizedTopK * 4
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

    const ranked = Array.from(scores.values())
      .map((item) => {
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
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, normalizedTopK)

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
        score: 0.41,
      }))

      if (fallback.length > 0) {
        return fallback
      }
    }

    return ranked
  }

  return {
    listKnowledgeBases,
    listKnowledgeBaseDocuments,
    toggleKnowledgeBaseActive,
    toggleDocumentActive,
    deleteDocument,
    rebuildKnowledgeBase,
    ingestDocument,
    search,
  }
}
