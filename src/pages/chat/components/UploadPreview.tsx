import type { UploadItem } from '../../../types/chat'

// 组件接收的参数：
// uploads：当前正在上传/已上传的文件列表
// onRemoveUpload：删除某个文件的回调函数
interface UploadPreviewProps {
  uploads: UploadItem[]
  onRemoveUpload: (uploadId: string) => void
}

/**
 * 格式化文件大小（字节 → B / KB / MB）
 * 用于在界面上友好显示文件大小
 */
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

/**
 * 文件上传预览组件
 * 功能：
 * 1. 显示正在上传的文件
 * 2. 显示上传进度条
 * 3. 显示状态（待上传/上传中/已解析/失败）
 * 4. 支持移除文件
 * 5. 显示错误/提示信息
 */
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
            <span>
              {upload.status === 'queued'
                ? '待上传'
                : upload.status === 'uploading'
                  ? `${upload.progress}%`
                  : upload.status === 'done'
                    ? '已解析'
                    : '上传失败'}
            </span>
          </div>

          {upload.note && upload.status === 'done' && (
            <p className="mt-1 text-[11px] text-amber-700">{upload.note}</p>
          )}

          {upload.error && (
            <p className="mt-1 text-[11px] text-rose-600">{upload.error}</p>
          )}
        </div>
      ))}
    </div>
  )
}
