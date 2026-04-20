import { useRef } from 'react'
import { UploadPreview } from './UploadPreview'
import type { AnswerMode, UploadItem } from '../../../types/chat'
import { ACCEPT_ATTRIBUTE } from '../../../utils/attachmentParser'
/**
 * 聊天输入框组件的 Props 定义
 * 接收状态、回调函数，控制输入框行为
 */
interface ChatInputProps {
  value: string
  disabled?: boolean
  uploads: UploadItem[]
  answerMode: AnswerMode
  onChange: (value: string) => void
  onChangeAnswerMode: (mode: AnswerMode) => void
  onSend: () => void
  onPickFile: (files: FileList) => void
  onRemoveUpload: (uploadId: string) => void
}

/**
 * 回答模式配置（严格 / 平衡 / 通用）
 * 每个模式包含值、显示名称、提示说明
 */
const MODE_OPTIONS: Array<{
  value: AnswerMode
  label: string
  helper: string
}> = [
  {
    value: 'strict',
    label: 'Shield 严格',
    helper: '仅知识库，缺失时拒答',
  },
  {
    value: 'balanced',
    label: 'Scale 平衡',
    helper: '优先知识库，不足时补充',
  },
  {
    value: 'general',
    label: 'Sparkles 通用',
    helper: '跳过知识库，纯 AI 回答',
  },
]

/**
 * 聊天输入框主组件
 * 包含：文件预览、回答模式切换、文本输入、文件上传、发送按钮
 */
export function ChatInput({
  value,
  disabled = false,
  uploads,
  answerMode,
  onChange,
  onChangeAnswerMode,
  onSend,
  onPickFile,
  onRemoveUpload,
}: ChatInputProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3 lg:px-6 lg:py-4">
      <UploadPreview uploads={uploads} onRemoveUpload={onRemoveUpload} />

      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="grid gap-2 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const active = option.value === answerMode
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangeAnswerMode(option.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-left transition',
                  active
                    ? 'border-sky-400 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                ].join(' ')}
              >
                <p className="text-xs font-semibold">{option.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{option.helper}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
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
