import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Sidebar } from '../../components/layout/Sidebar'
import { TopBar } from '../../components/layout/TopBar'
import { useSessionSidebar } from '../../hooks/useSessionSidebar'
import {
  createKnowledgeBase,
  deleteKnowledgeDocument,
  listKnowledgeBaseDocuments,
  listKnowledgeBases,
  rebuildSearchEngine,
  testRetrieval,
  toggleDocumentActive,
  toggleKnowledgeBaseActive,
  uploadKnowledgeDocument,
} from '../../services/knowledgeApi'
import { useThemeStore } from '../../store/themeStore'
import { useUIStore } from '../../store/uiStore'
import type { DocumentItem, KnowledgeBase, SearchResult } from '../../types/knowledge'

/**
 * 开关组件（Toggle）Props
 */
interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}

/**
 * 上传任务状态
 */
interface UploadTask {
  id: string
  name: string
  progress: number
  status: 'uploading' | 'done' | 'failed'
  error?: string
}

/**
 * 开关组件：用于启用/禁用知识库、文档
 */
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

/**
 * 本地知识库管理页面
 * 功能：
 * 1. 创建/切换知识库
 * 2. 上传文档、解析、切片
 * 3. 启用/禁用文档、知识库
 * 4. 测试检索（相似度搜索）
 * 5. 重建索引、删除文档
 * 6. 查看存储/文档/索引状态
 */
export function KnowledgeBasePage() {
  // 知识库列表
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  // 当前知识库的文档列表
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  // 检索测试输入框内容
  const [query, setQuery] = useState('')
  // 检索测试结果
  const [results, setResults] = useState<SearchResult[]>([])
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 错误提示
  const [error, setError] = useState('')
  // 测试检索中
  const [testing, setTesting] = useState(false)
  // 上传中
  const [uploading, setUploading] = useState(false)
  // 创建知识库中
  const [creatingKb, setCreatingKb] = useState(false)
  // 删除文档中（记录ID）
  const [deletingDocumentId, setDeletingDocumentId] = useState('')
  // 上传任务列表（显示进度条）
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])

  const {
    sessions,
    activeSession,
    activeSessionId,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    setActiveSessionId,
    handleNewSession,
    handleRenameSession,
    handleDeleteSession,
  } = useSessionSidebar()

  const themeMode = useThemeStore((state) => state.mode)
  const toggleTheme = useThemeStore((state) => state.toggleMode)
  const setPage = useUIStore((state) => state.setPage)

  // 全局状态：当前选中的知识库ID
  const activeKbId = useUIStore((state) => state.activeKnowledgeBaseId)
  const retrievalMode = useUIStore((state) => state.retrievalMode)
  const setActiveKnowledgeBaseId = useUIStore((state) => state.setActiveKnowledgeBaseId)

  // 当前选中的知识库
  const activeKb = useMemo(() => {
    return bases.find((item) => item.id === activeKbId)
  }, [activeKbId, bases])

  // 加载知识库列表
  useEffect(() => {
    const loadBases = async () => {
      setLoading(true)
      setError('')
      try {
        const items = await listKnowledgeBases()
        setBases(items)
        // 如果当前选中的知识库不存在，自动切换到第一个
        if (!items.find((item) => item.id === activeKbId)) {
          setActiveKnowledgeBaseId(items[0]?.id ?? '')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载知识库失败。')
      } finally {
        setLoading(false)
      }
    }

    void loadBases()
  }, [activeKbId, setActiveKnowledgeBaseId])

  // 切换知识库时，加载对应文档
  useEffect(() => {
    if (!activeKbId) {
      setDocuments([])
      return
    }

    const loadDocuments = async () => {
      setError('')
      try {
        const docs = await listKnowledgeBaseDocuments(activeKbId)
        setDocuments(docs)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载文档失败。')
      }
    }

    void loadDocuments()
  }, [activeKbId])

  // 已激活的文档数量
  const activeDocsCount = useMemo(() => {
    return documents.filter((doc) => doc.isActive).length
  }, [documents])

  // 索引状态显示文字
  const indexStatusLabel = useMemo(() => {
    if (!activeKb) {
      return '不可用'
    }

    if ((activeKb.indexJobs ?? 0) > 0 || activeKb.status === '索引中') {
      return `${activeKb.indexJobs} 个运行中`
    }

    return '就绪 ✓'
  }, [activeKb])

  // 重建搜索引擎索引
  const onRebuildSearchEngine = async () => {
    if (!activeKbId) {
      return
    }

    try {
      const updated = await rebuildSearchEngine(activeKbId)
      setBases((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '重建索引失败。')
    }
  }

  // 切换知识库启用状态
  const onToggleKnowledgeBaseActive = async (id: string) => {
    try {
      const updated = await toggleKnowledgeBaseActive(id)
      setBases((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      if (activeKbId === id) {
        setResults([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新知识库状态失败。')
    }
  }

  // 创建新知识库
  const onCreateKnowledgeBase = async () => {
    const input = window.prompt('请输入知识库名称', '新建知识库')
    if (input === null) {
      return
    }

    const name = input.trim()
    if (!name) {
      setError('知识库名称不能为空。')
      return
    }

    setCreatingKb(true)
    setError('')

    try {
      const created = await createKnowledgeBase(name)
      setActiveKnowledgeBaseId(created.id)
      setResults([])
      await reloadKnowledgeData(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建知识库失败。')
    } finally {
      setCreatingKb(false)
    }
  }

  // 切换文档启用/禁用状态
  const onToggleDocumentActive = async (id: string) => {
    try {
      const updated = await toggleDocumentActive(id)
      setDocuments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setResults([])
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新文档状态失败。')
    }
  }

  // 删除文档
  const onDeleteDocument = async (doc: DocumentItem) => {
    if (!activeKbId) {
      return
    }

    const confirmDelete = window.confirm(`确认删除文档「${doc.name}」吗？该操作不可恢复。`)
    if (!confirmDelete) {
      return
    }

    setDeletingDocumentId(doc.id)
    setError('')

    try {
      await deleteKnowledgeDocument(doc.id)
      await reloadKnowledgeData(activeKbId)
      setResults((prev) => prev.filter((item) => item.docId !== doc.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除文档失败。')
    } finally {
      setDeletingDocumentId('')
    }
  }

  // 测试检索：输入问题，返回最相关的5条片段
  const onTestRetrieval = async () => {
    if (!activeKbId || !query.trim()) {
      setResults([])
      return
    }

    setTesting(true)
    setError('')
    try {
      const items = await testRetrieval(activeKbId, query, 5, retrievalMode)
      setResults(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试检索失败。')
      setResults([])
    } finally {
      setTesting(false)
    }
  }

  // 重新加载知识库 + 文档列表
  const reloadKnowledgeData = async (kbId: string) => {
    const [baseList, docList] = await Promise.all([
      listKnowledgeBases(),
      listKnowledgeBaseDocuments(kbId),
    ])
    setBases(baseList)
    setDocuments(docList)
  }

  // 上传文档到知识库
  const onUploadDocument = async (files: FileList | null) => {
    const fileList = files ? Array.from(files) : []
    if (fileList.length === 0 || !activeKbId) {
      return
    }

    setUploading(true)
    setError('')

    // 生成上传任务，用于显示进度条
    const taskIds = fileList.map(() => crypto.randomUUID())
    setUploadTasks((prev) => [
      ...fileList.map((file, index) => ({
        id: taskIds[index],
        name: file.name,
        progress: 0,
        status: 'uploading' as const,
      })),
      ...prev,
    ])

    // 批量上传
    const outcomes = await Promise.allSettled(
      fileList.map((file, index) =>
        uploadKnowledgeDocument(activeKbId, file, {
          onProgress: (progress) => {
            setUploadTasks((prev) =>
              prev.map((item) =>
                item.id === taskIds[index]
                  ? {
                      ...item,
                      progress,
                    }
                  : item,
              ),
            )
          },
        })
          .then(() => {
            setUploadTasks((prev) =>
              prev.map((item) =>
                item.id === taskIds[index]
                  ? {
                      ...item,
                      progress: 100,
                      status: 'done',
                    }
                  : item,
              ),
            )
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : '上传失败'
            setUploadTasks((prev) =>
              prev.map((item) =>
                item.id === taskIds[index]
                  ? {
                      ...item,
                      status: 'failed',
                      error: message,
                    }
                  : item,
              ),
            )
            throw err
          }),
      ),
    )

    // 检查是否有失败
    const hasFailure = outcomes.some((item) => item.status === 'rejected')
    if (hasFailure) {
      setError('部分文档上传失败，请查看下方失败原因。')
    }

    // 刷新列表
    try {
      await reloadKnowledgeData(activeKbId)
      setResults([])
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新文档列表失败。')
    }

    setUploading(false)
  }

  // ——————————————————————————————
  // 页面渲染
  // ——————————————————————————————
  return (
    <AppShell
      mobileSidebarOpen={mobileSidebarOpen}
      onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
      sidebar={
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={handleNewSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
      }
      header={
        <TopBar
          title="本地知识库管理"
          model={activeSession?.model ?? 'glm-4-flash'}
          themeMode={themeMode}
          isKnowledgeBasePage
          isStreaming={false}
          isPaused={false}
          canRegenerate={false}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onOpenKnowledgeBase={() => setPage('knowledge-base')}
          onBackToChat={() => setPage('chat')}
          onToggleTheme={toggleTheme}
          onPause={() => {}}
          onResume={() => {}}
          onRegenerate={() => {}}
          onClear={() => {}}
          onExport={() => {}}
        />
      }
    >
      <div className="h-full overflow-auto px-4 py-4 lg:px-6">
        <div className="grid gap-4 lg:grid-cols-12">

        {/* 左侧：知识库列表 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">知识库列表</h2>
            <button
              type="button"
              onClick={() => {
                void onCreateKnowledgeBase()
              }}
              disabled={creatingKb}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              {creatingKb ? '创建中...' : '新建'}
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
                  onClick={() => {
                    setActiveKnowledgeBaseId(kb.id)
                    setResults([])
                  }}
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
                    onChange={() => {
                      void onToggleKnowledgeBaseActive(kb.id)
                    }}
                    label="在对话中引用"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 中间：文档管理 + 上传 + 检索测试 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              当前知识库：{activeKb?.name ?? '未知'}
            </h2>
            <label className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">
              {uploading ? '上传中...' : '上传文档'}
              <input
                type="file"
                className="hidden"
                accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx"
                onChange={(event) => {
                  void onUploadDocument(event.target.files)
                  event.currentTarget.value = ''
                }}
                disabled={uploading}
                multiple
              />
            </label>
          </div>

          {/* 检索测试 */}
          <div className="mb-4 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入测试查询，验证检索质量..."
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => {
                void onTestRetrieval()
              }}
              disabled={testing || query.trim().length === 0}
              className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
            >
              {testing ? '检索中...' : '测试检索'}
            </button>
          </div>

          {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}
          {loading ? <p className="mb-3 text-xs text-slate-500">加载知识库中...</p> : null}

          {/* 文档列表 */}
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {doc.chunks} 块 · {doc.size}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">更新于 {doc.updatedAt}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Toggle
                      checked={doc.isActive}
                      onChange={() => {
                        void onToggleDocumentActive(doc.id)
                      }}
                      label="在对话中引用"
                      disabled={!activeKb?.isActive}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void onDeleteDocument(doc)
                      }}
                      disabled={deletingDocumentId === doc.id}
                      className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingDocumentId === doc.id ? '删除中...' : '删除文档'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 上传任务进度条 */}
          {uploadTasks.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-700">上传任务</p>
              <div className="space-y-2">
                {uploadTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-700">{task.name}</p>
                      <span
                        className={[
                          'text-[11px]',
                          task.status === 'failed'
                            ? 'text-rose-600'
                            : task.status === 'done'
                              ? 'text-emerald-700'
                              : 'text-sky-700',
                        ].join(' ')}
                      >
                        {task.status === 'failed'
                          ? '失败'
                          : task.status === 'done'
                            ? '完成'
                            : `${task.progress}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded bg-slate-200">
                      <div
                        className={[
                          'h-1.5 rounded transition-all',
                          task.status === 'failed' ? 'bg-rose-500' : 'bg-sky-500',
                        ].join(' ')}
                        style={{ width: `${task.status === 'failed' ? Math.max(task.progress, 12) : task.progress}%` }}
                      />
                    </div>
                    {task.error ? <p className="mt-1 text-[11px] text-rose-600">{task.error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 检索结果展示 */}
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

        {/* 右侧：系统状态面板 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900">系统状态</h2>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">存储</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeKb?.storageUsed ?? '0 B'} / {activeKb?.storageTotal ?? '1 GB'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">文档</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeDocsCount} 个已激活
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">索引</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {indexStatusLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void onRebuildSearchEngine()
            }}
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
          >
            重建索引
          </button>
        </section>
        </div>
      </div>
    </AppShell>
  )
}