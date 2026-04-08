import { useMemo, useState } from 'react'

interface KnowledgeBase {
  id: string
  name: string
  status: string
  docs: number
  chunks: number
  updatedAt: string
  storageUsed: string
  storageTotal: string
  embeddingModel: string
  embeddingDims: number
  indexJobs: number
  isActive: boolean
}

interface DocumentItem {
  id: string
  kbId: string
  name: string
  size: string
  chunks: number
  updatedAt: string
  isActive: boolean
}

interface SearchChunk {
  id: string
  kbId: string
  docId: string
  source: string
  content: string
}

interface SearchResult extends SearchChunk {
  score: number
}

const initialBases: KnowledgeBase[] = [
  {
    id: 'kb-default',
    name: '默认知识库',
    docs: 24,
    chunks: 1486,
    updatedAt: '今天 10:12',
    status: '健康',
    storageUsed: '156MB',
    storageTotal: '1GB',
    embeddingModel: 'MiniLM-L6',
    embeddingDims: 384,
    indexJobs: 2,
    isActive: true,
  },
  {
    id: 'kb-product',
    name: '产品文档库',
    docs: 9,
    chunks: 502,
    updatedAt: '昨天 18:05',
    status: '索引中',
    storageUsed: '81MB',
    storageTotal: '1GB',
    embeddingModel: 'BGE-Small-ZH',
    embeddingDims: 512,
    indexJobs: 1,
    isActive: true,
  },
]

const initialDocuments: DocumentItem[] = [
  {
    id: 'doc-1',
    kbId: 'kb-default',
    name: '接入手册-v3.pdf',
    size: '3.2 MB',
    chunks: 86,
    updatedAt: '今天 09:50',
    isActive: true,
  },
  {
    id: 'doc-2',
    kbId: 'kb-default',
    name: 'FAQ-售后策略.md',
    size: '48 KB',
    chunks: 14,
    updatedAt: '今天 09:20',
    isActive: false,
  },
  {
    id: 'doc-3',
    kbId: 'kb-default',
    name: '知识抽取规则.txt',
    size: '12 KB',
    chunks: 6,
    updatedAt: '昨天 20:14',
    isActive: true,
  },
  {
    id: 'doc-4',
    kbId: 'kb-product',
    name: '产品需求总览.md',
    size: '72 KB',
    chunks: 22,
    updatedAt: '昨天 17:10',
    isActive: true,
  },
  {
    id: 'doc-5',
    kbId: 'kb-product',
    name: '版本发布说明-2026Q1.pdf',
    size: '1.8 MB',
    chunks: 41,
    updatedAt: '昨天 16:40',
    isActive: true,
  },
]

const mockChunks: SearchChunk[] = [
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

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => {
          if (!disabled) {
            onChange(!checked)
          }
        }}
        disabled={disabled}
        className={[
          'relative h-6 w-11 rounded-full transition',
          checked ? 'bg-emerald-500' : 'bg-slate-300',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition',
            checked ? 'left-5' : 'left-0.5',
          ].join(' ')}
        />
      </button>
      {label}
    </label>
  )
}

function calcScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()

  if (!q) {
    return 0
  }

  const tokens = q.split(/\s+/).filter(Boolean)
  let hit = 0

  tokens.forEach((token) => {
    if (t.includes(token)) {
      hit += 1
    }
  })

  const tokenScore = tokens.length > 0 ? hit / tokens.length : 0
  const phraseScore = t.includes(q) ? 0.25 : 0
  const lengthPenalty = Math.min(q.length / 60, 0.15)

  return Math.min(0.99, 0.35 + tokenScore * 0.5 + phraseScore + lengthPenalty)
}

export function KnowledgeBasePage() {
  const [bases, setBases] = useState<KnowledgeBase[]>(initialBases)
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments)
  const [activeKbId, setActiveKbId] = useState<string>(initialBases[0].id)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [engineVersion, setEngineVersion] = useState(1)
  const [lastRebuildAt, setLastRebuildAt] = useState('')

  const activeKb = useMemo(() => {
    return bases.find((item) => item.id === activeKbId) ?? bases[0]
  }, [activeKbId, bases])

  const docsOfActiveKb = useMemo(() => {
    return documents.filter((doc) => doc.kbId === activeKbId)
  }, [activeKbId, documents])

  const activeDocsCount = useMemo(() => {
    return docsOfActiveKb.filter((doc) => doc.isActive).length
  }, [docsOfActiveKb])

  const rebuildSearchEngine = () => {
    setEngineVersion((prev) => prev + 1)
    setLastRebuildAt(
      new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    )
  }

  const toggleKnowledgeBaseActive = (id: string) => {
    setBases((prev) =>
      prev.map((kb) => (kb.id === id ? { ...kb, isActive: !kb.isActive } : kb)),
    )
    rebuildSearchEngine()
  }

  const toggleDocumentActive = (id: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, isActive: !doc.isActive } : doc)),
    )
    rebuildSearchEngine()
  }

  const testRetrieval = () => {
    if (!activeKb || !query.trim()) {
      setResults([])
      return
    }

    const enabledDocIds = new Set(
      docsOfActiveKb.filter((doc) => doc.isActive).map((doc) => doc.id),
    )

    const top5 = mockChunks
      .filter((chunk) => chunk.kbId === activeKb.id)
      .filter((chunk) => enabledDocIds.has(chunk.docId))
      .map((chunk) => ({
        ...chunk,
        score: calcScore(query, `${chunk.source} ${chunk.content}`),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    setResults(top5)
  }

  return (
    <div className="h-full overflow-auto px-4 py-4 lg:px-6">
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">知识库列表</h2>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              新建
            </button>
          </div>

          <div className="space-y-2">
            {bases.map((kb) => (
              <div
                key={kb.id}
                className={[
                  'rounded-lg border p-3 transition',
                  kb.id === activeKbId
                    ? 'border-sky-400 bg-sky-50/60'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setActiveKbId(kb.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{kb.name}</p>
                    <span className="text-xs text-slate-500">{kb.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    文档 {kb.docs} · 切片 {kb.chunks}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">更新于 {kb.updatedAt}</p>
                </button>

                <div className="mt-2 border-t border-slate-200 pt-2">
                  <Toggle
                    checked={kb.isActive}
                    onChange={() => toggleKnowledgeBaseActive(kb.id)}
                    label="在对话中引用"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              当前知识库：{activeKb?.name ?? '未知'}
            </h2>
            <label className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">
              上传文档
              <input type="file" className="hidden" multiple />
            </label>
          </div>

          <div className="mb-4 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入测试查询，验证检索质量..."
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={testRetrieval}
              className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
            >
              测试检索
            </button>
          </div>

          <div className="space-y-2">
            {docsOfActiveKb.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {doc.chunks} 块 · {doc.size}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">更新于 {doc.updatedAt}</p>
                  </div>
                  <Toggle
                    checked={doc.isActive}
                    onChange={() => toggleDocumentActive(doc.id)}
                    label="在对话中引用"
                    disabled={!activeKb?.isActive}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700">Top-5 检索结果</p>
            {results.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">暂无结果，输入查询后点击“测试检索”。</p>
            ) : (
              <div className="mt-2 space-y-2">
                {results.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        来源：{item.source}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700">
                        相似度 {(item.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900">系统状态</h2>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">存储占用</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeKb?.storageUsed}/{activeKb?.storageTotal}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">向量模型</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeKb?.embeddingModel}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{activeKb?.embeddingDims} 维</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">索引任务</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeKb?.indexJobs} 个运行中
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">已激活文档</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{activeDocsCount} / {docsOfActiveKb.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">检索引擎版本</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">v{engineVersion}</p>
              {lastRebuildAt ? (
                <p className="mt-0.5 text-xs text-slate-500">最近重建：{lastRebuildAt}</p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-500">尚未重建</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={rebuildSearchEngine}
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
          >
            重建索引
          </button>
        </section>
      </div>
    </div>
  )
}
