import { useEffect, useRef } from 'react'
import { MessageItem } from './MessageItem'
import type { ChatMessage } from '../../types/chat'

interface MessageListProps {
  messages: ChatMessage[]
}

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => fn(...args), wait)
  }
}

export function MessageList({ messages }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scrollToBottom = debounce(() => {
      container.scrollTop = container.scrollHeight
    }, 24)

    scrollToBottom()
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8">
          <p className="text-base font-semibold text-slate-900">开启新对话</p>
          <p className="mt-2 text-sm text-slate-600">
            输入你的问题，或先上传文件。后续这里会接入 SSE 实时流式回答。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-4 py-5 lg:px-8">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}
