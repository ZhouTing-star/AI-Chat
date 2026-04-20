import { memo, useMemo, useState, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import type { AnswerMode, ChatMessage, MessageType } from '../../../types/chat'

// 组件接收的 Props：单条消息对象
interface MessageItemProps {
  message: ChatMessage
}

// 代码块组件 Props
interface CodeBlockProps {
  language: string
  code: string
}

/**
 * 代码块组件（带复制功能）
 */
function CodeBlock({ language, code }: CodeBlockProps) {
  // 控制“复制”按钮文字状态
  const [copied, setCopied] = useState(false)

  // 复制代码到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      // 1.2秒后恢复“复制”文字
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 rounded border border-slate-500/60 bg-slate-800/85 px-2 py-1 text-[10px] text-slate-100 transition hover:bg-slate-700"
      >
        {copied ? '已复制' : '复制'}
      </button>

      <SyntaxHighlighter
        language={language}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          padding: '0.75rem',
          fontSize: '12px',
          lineHeight: '1.6',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
/**
 * 渲染【文本/Markdown】类型消息
 */
function renderTextMessage(message: ChatMessage) {
  return (
    <div className="markdown-body text-sm leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-lg font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sky-600 underline decoration-sky-400/70 underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const language = className?.replace('language-', '').trim()
            const code = String(children).replace(/\n$/, '')

            if (language) {
              return <CodeBlock language={language} code={code} />
            }

            return <code className="rounded bg-slate-200/70 px-1 py-0.5 text-xs">{children}</code>
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-slate-300 px-2 py-1">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-4 border-slate-300 pl-3 text-slate-600">
              {children}
            </blockquote>
          ),
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  )
}

/**
 * 渲染【图片】类型消息
 */
function renderImageMessage(message: ChatMessage) {
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.imageUrl && (
        <img
          src={message.imageUrl}
          alt={message.fileName ?? '消息图片'}
          loading="lazy"
          className="max-h-72 w-full rounded-lg object-cover"
        />
      )}
    </div>
  )
}
/**
 * 渲染【文件】类型消息
 */
function renderFileMessage(message: ChatMessage) {
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap">{message.content}</p>
      <a
        href={message.fileUrl ?? '#'}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
      >
        {message.fileName ?? '下载文件'}
      </a>
    </div>
  )
}
// 消息类型 -> 渲染函数 映射表
const messageRenderer: Record<MessageType, (message: ChatMessage) => ReactElement> = {
  text: renderTextMessage,
  image: renderImageMessage,
  file: renderFileMessage,
}

// ========== 引用来源（Citations）相关配置 ==========
const CITATION_SCORE_THRESHOLD = 0.4      // 普通相关性阈值
const STRICT_SCORE_THRESHOLD = 0.7        // 严格高匹配阈值
const CITATION_MAX_COUNT = 5              // 最多展示几条来源
const CITATION_PREVIEW_CHARS = 80         // 来源内容预览长度

// 透明度徽章类型
interface TransparencyBadge {
  text: string
  toneClass: string
}
/**
 * 解码 HTML 实体（如 &lt; &gt;）
 */
function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') {
    return text
  }

  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}
/**
 * 解码 HTML 实体（如 &lt; &gt;）
 */
function cleanCitationText(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, ' ')
  const decoded = decodeHtmlEntities(withoutTags)
  return decoded.replace(/\s+/g, ' ').trim()
}
/**
 * 文本截断（超出长度显示 ...）
 */
function shortenText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit).trim()}...`
}

/**
 * 根据回答模式和引用分数，构建底部的透明度徽章（基于资料/未找到/AI回答）
 */
function buildTransparencyBadge(
  answerMode: AnswerMode,
  citations: Array<{ score: number }>,
): TransparencyBadge {
  const maxScore = citations.reduce((acc, item) => Math.max(acc, item.score), 0)
  const strictHits = citations.filter((item) => item.score >= STRICT_SCORE_THRESHOLD).length

  if (answerMode === 'strict') {
    if (strictHits > 0) {
      return {
        text: `✅ 基于 ${strictHits} 份资料`,
        toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    }

    return {
      text: '❌ 知识库未涵盖',
      toneClass: 'border-rose-200 bg-rose-50 text-rose-700',
    }
  }

  if (answerMode === 'general') {
    return {
      text: '🤖 AI 通用知识',
      toneClass: 'border-slate-200 bg-slate-100 text-slate-700',
    }
  }

  if (maxScore >= STRICT_SCORE_THRESHOLD) {
    return {
      text: `📚 高度相关 ${(maxScore * 100).toFixed(1)}%`,
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  if (maxScore >= CITATION_SCORE_THRESHOLD) {
    return {
      text: `⚠️ 部分相关 ${(maxScore * 100).toFixed(1)}%`,
      toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    text: '💡 AI 通用知识',
    toneClass: 'border-slate-200 bg-slate-100 text-slate-700',
  }
}
/**
 * 单条消息主体组件
 */
function MessageItemComponent({ message }: MessageItemProps) {
  const isUser = message.role === 'user'             // 是否是用户消息
  const isStreaming = message.status === 'streaming' // 是否正在流式输出
  const type: MessageType = message.type ?? 'text'    // 消息类型，默认文本
  const renderer = messageRenderer[type] ?? renderTextMessage // 获取对应渲染函数
  // 引用来源面板展开状态
  const [citationsPanelOpen, setCitationsPanelOpen] = useState(false)
  const [highQualityExpanded, setHighQualityExpanded] = useState(false)
  const [lowQualityExpanded, setLowQualityExpanded] = useState(false)

  // 对引用进行排序、清洗、截取（useMemo 缓存，避免重复计算）
  const sortedCitations = useMemo(() => {
    return (message.citations ?? [])
      .sort((a, b) => b.score - a.score) // 按分数降序
      .slice(0, CITATION_MAX_COUNT)      // 最多取5条
      .map((item) => ({
        ...item,
        source: cleanCitationText(item.source),
        content: cleanCitationText(item.content),
      }))
  }, [message.citations])

   // 筛选高/低质量引用
  const highQualityCitations = sortedCitations.filter((item) => item.score >= CITATION_SCORE_THRESHOLD)
  const lowQualityCitations = sortedCitations.filter((item) => item.score < CITATION_SCORE_THRESHOLD)
  const answerMode: AnswerMode = message.answerMode ?? 'balanced'
  const transparencyBadge = buildTransparencyBadge(answerMode, sortedCitations)

  // 控制展示多少条高质量引用
  const visibleCitations = highQualityExpanded ? highQualityCitations : highQualityCitations.slice(0, 1)

  return (
    <div className={['mb-4 flex', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <article
        className={[
          'max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
          isUser
            ? 'rounded-br-md bg-slate-900 text-slate-100'
            : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
        ].join(' ')}
      >
        {renderer(message)}
        {!isUser && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setCitationsPanelOpen((prev) => !prev)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                transparencyBadge.toneClass,
                sortedCitations.length > 0 ? 'hover:opacity-85' : 'cursor-default',
              ].join(' ')}
              disabled={sortedCitations.length === 0}
            >
              {transparencyBadge.text}
            </button>
          </div>
        )}
        {sortedCitations.length > 0 && citationsPanelOpen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-600">
                引用来源（Top-{sortedCitations.length}）
              </p>
              {highQualityCitations.length > 1 && (
                <button
                  type="button"
                  onClick={() => setHighQualityExpanded((prev) => !prev)}
                  className="text-[11px] font-medium text-sky-600 hover:text-sky-700"
                >
                  {highQualityExpanded ? '仅看最高匹配' : '查看全部高质量'}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {visibleCitations.map((item, index) => (
                <div key={item.id} className="rounded border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-700">
                      [{index + 1}] {item.source}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      {(item.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {shortenText(item.content, CITATION_PREVIEW_CHARS)}
                  </p>
                </div>
              ))}

              {lowQualityCitations.length > 0 && (
                <div className="rounded border border-dashed border-slate-300 bg-white p-2">
                  <button
                    type="button"
                    onClick={() => setLowQualityExpanded((prev) => !prev)}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
                  >
                    匹配度较低（{lowQualityCitations.length}）
                  </button>

                  {lowQualityExpanded && (
                    <div className="mt-2 space-y-2">
                      {lowQualityCitations.map((item) => (
                        <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-700">{item.source}</span>
                            <span className="text-[11px] text-amber-700">
                              {(item.score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">
                            {shortenText(item.content, CITATION_PREVIEW_CHARS)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {isStreaming && (
          <span className="mt-1 inline-flex h-2 w-12 items-center gap-1" aria-label="AI 正在生成">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:240ms]" />
          </span>
        )}
        <p className="mt-1 text-[11px] text-slate-400">{message.createdAt}</p>
      </article>
    </div>
  )
}

// 使用 memo 包裹，防止不必要的重渲染（性能优化）
export const MessageItem = memo(MessageItemComponent)
