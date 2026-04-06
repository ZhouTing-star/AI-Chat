import { MessageItem } from './MessageItem'
import type { ChatMessage } from '../../types/chat'

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
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
    <div className="h-full overflow-y-auto px-4 py-5 lg:px-8">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}
