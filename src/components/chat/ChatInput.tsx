import { useRef } from 'react'
import { UploadPreview } from './UploadPreview'
import type { UploadItem } from '../../types/chat'

interface ChatInputProps {
  value: string
  disabled?: boolean
  uploads: UploadItem[]
  onChange: (value: string) => void
  onSend: () => void
  onPickFile: (files: FileList) => void
  onRemoveUpload: (uploadId: string) => void
}

export function ChatInput({
  value,
  disabled = false,
  uploads,
  onChange,
  onSend,
  onPickFile,
  onRemoveUpload,
}: ChatInputProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3 lg:px-6 lg:py-4">
      <UploadPreview uploads={uploads} onRemoveUpload={onRemoveUpload} />

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) {
              onPickFile(files)
              // 允许连续选择同一个文件也能再次触发 onChange。
              event.target.value = ''
            }
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-11 w-11 shrink-0 rounded-xl border border-slate-300 text-xl text-slate-600 transition hover:bg-slate-100"
          aria-label="选择文件"
        >
          +
        </button>

        <label className="block min-h-11 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-sky-400 focus-within:bg-white">
          <span className="sr-only">输入消息</span>
          <textarea
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入消息，Shift + Enter 换行"
            className="max-h-32 w-full resize-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            onKeyDown={(event) => {
              // Enter 直接发送，Shift + Enter 才换行，符合常见聊天输入习惯。
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
          />
        </label>

        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className="h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          发送
        </button>
      </div>
    </div>
  )
}
