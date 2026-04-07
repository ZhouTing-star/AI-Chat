import { memo, useState, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, MessageType } from '../../types/chat'

interface MessageItemProps {
  message: ChatMessage
}

interface CodeBlockProps {
  language: string
  code: string
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
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

const messageRenderer: Record<MessageType, (message: ChatMessage) => ReactElement> = {
  text: renderTextMessage,
  image: renderImageMessage,
  file: renderFileMessage,
}

function MessageItemComponent({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isStreaming = message.status === 'streaming'
  const type: MessageType = message.type ?? 'text'
  const renderer = messageRenderer[type] ?? renderTextMessage

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

export const MessageItem = memo(MessageItemComponent)
