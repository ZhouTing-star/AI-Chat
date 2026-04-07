import type { UploadItem } from '../../types/chat'

interface UploadPreviewProps {
  uploads: UploadItem[]
  onRemoveUpload: (uploadId: string) => void
}

function formatFileSize(size: number): string {
  // 页面展示用的轻量格式化，统一成 B/KB/MB 三档。
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadPreview({ uploads, onRemoveUpload }: UploadPreviewProps) {
  if (uploads.length === 0) {
    return null
  }

  return (
    <div className="mb-3 grid gap-2">
      {uploads.map((upload) => (
        <div
          key={upload.id}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="truncate text-xs font-medium text-slate-800">{upload.name}</p>
            <button
              type="button"
              onClick={() => onRemoveUpload(upload.id)}
              className="text-xs text-slate-500 transition hover:text-slate-900"
            >
              移除
            </button>
          </div>

          <div className="mb-1 h-1.5 rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${upload.progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{formatFileSize(upload.size)}</span>
            <span>{upload.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
