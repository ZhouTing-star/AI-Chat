import JSZip from 'jszip'

// 定义 PDF.js 库的模块类型
type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

// PDF.js 懒加载器（单例，避免重复加载）
let pdfJsLoader: Promise<PdfJsModule> | null = null

/**
 * 懒加载 PDF.js 库并配置工作线程
 * 避免首次加载时体积过大，用到时才加载
 */
async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsLoader) {
    pdfJsLoader = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/build/pdf.worker?url'),
    ]).then(([pdfjsLib, worker]) => {
      // 配置 PDF.js 使用的工作线程脚本 URL
      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
      }
      return pdfjsLib
    })
  }

  return pdfJsLoader
}

// ==============================
// 常量配置
// ==============================

/**
 * 最大允许上传文件大小：8MB
 */
export const MAX_FILE_SIZE = 8 * 1024 * 1024

/**
 * 文本预览最大截取长度：8000 字符
 */
export const MAX_TEXT_PREVIEW = 8000

/**
 * 允许解析的文件后缀名
 */
const ALLOWED_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'pdf',
  'docx',
])

/**
 * 允许解析的 MIME 类型
 */
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * 生成 input[type=file] 支持的 accept 属性字符串
 * 格式：.txt,.md,.pdf,.docx
 */
export const ACCEPT_ATTRIBUTE = Array.from(ALLOWED_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',')

// ==============================
// 类型定义
// ==============================

/**
 * 解析后的文本内容 + 提示信息
 */
interface ParsedContent {
  body: string   // 解析出的正文
  note: string   // 提示（截断/解析失败说明）
}

/**
 * 最终生成的附件对象
 */
interface ExtractedAttachment extends ParsedContent {
  id: string         // 唯一ID
  name: string       // 文件名
  size: number       // 文件大小
  mimeType: string   // 文件类型
  addedAt: number    // 添加时间戳
}

// ==============================
// 工具方法
// ==============================

/**
 * 格式化文件大小（B → KB → MB）
 */
export function formatSize(size = 0): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 生成附件唯一ID
 * 优先使用 crypto.randomUUID，兼容降级
 */
function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

/**
 * 截断超长文本，生成预览内容
 */
function truncatePreview(text = ''): ParsedContent {
  const trimmed = text.trim()
  const body = trimmed.slice(0, MAX_TEXT_PREVIEW)
  const note = trimmed.length > MAX_TEXT_PREVIEW ? '内容已截断，仅展示前 8000 字符' : ''

  return { body, note }
}

/**
 * 读取普通文本文件（txt/md/json/log/csv）
 */
function readAsText(file: File): Promise<ParsedContent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(truncatePreview((reader.result ?? '').toString()))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

/**
 * 解析 DOCX 文件，提取纯文本
 */
async function extractDocxText(file: File): Promise<ParsedContent> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docFile = zip.file('word/document.xml')

  if (!docFile) {
    return {
      body: '',
      note: '未找到 DOCX 正文，已附带文件元信息。',
    }
  }

  const xml = await docFile.async('string')
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // 提取 XML 中的段落与文字
  const text = Array.from(doc.getElementsByTagName('w:p'))
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagName('w:t'))
        .map((node) => node.textContent || '')
        .join(''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  if (!text.trim()) {
    return {
      body: '',
      note: 'DOCX 中未提取到文本内容。',
    }
  }

  return truncatePreview(text)
}

/**
 * 解析 PDF 文件，提取每页文本
 */
async function extractPdfText(file: File): Promise<ParsedContent> {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const chunks: string[] = []

  // 逐页提取文本
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const current = await pdf.getPage(page)
    const content = await current.getTextContent()

    const pageText = content.items
      .map((item: unknown) => {
        if (item && typeof item === 'object' && 'str' in item) {
          return String((item as { str?: unknown }).str ?? '')
        }
        return ''
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (pageText) {
      chunks.push(pageText)
    }

    // 提前截断，避免内容过长
    if (chunks.join('\n\n').length > MAX_TEXT_PREVIEW * 1.5) {
      break
    }
  }

  // 销毁 PDF 实例释放内存
  await loadingTask.destroy()

  const text = chunks.join('\n\n')
  if (!text.trim()) {
    return {
      body: '',
      note: 'PDF 中未提取到文本内容。',
    }
  }

  return truncatePreview(text)
}

/**
 * 获取文件后缀名（小写）
 */
function getExtension(name = ''): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

/**
 * 判断是否为普通文本类文件
 */
function isTextLike(file: File): boolean {
  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

  if (['txt', 'md', 'csv', 'json', 'log'].includes(ext)) return true
  if (type.startsWith('text/')) return true
  if (type.includes('json')) return true

  return false
}

/**
 * 校验文件类型是否允许上传解析
 */
export function isFileTypeAllowed(file: File): boolean {
  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true
  if (type && ALLOWED_MIME_TYPES.has(type)) return true

  return false
}

/**
 * 根据文件类型自动选择对应解析器
 */
async function readFileContent(file: File): Promise<ParsedContent> {
  if (isTextLike(file)) {
    return readAsText(file)
  }

  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

  // 解析 DOCX
  if (ext === 'docx' || type.includes('officedocument.wordprocessingml')) {
    try {
      return await extractDocxText(file)
    } catch {
      return {
        body: '',
        note: 'DOCX 解析失败，已附带文件元信息。',
      }
    }
  }

  // 解析 PDF
  if (ext === 'pdf' || type === 'application/pdf') {
    try {
      return await extractPdfText(file)
    } catch {
      return {
        body: '',
        note: 'PDF 解析失败，已附带文件元信息。',
      }
    }
  }

  // 不支持的类型
  return {
    body: '',
    note: '该文件类型暂无文本解析，已附带元信息。',
  }
}

// ==============================
// 对外暴露核心方法
// ==============================

/**
 * 从上传的 File 对象生成可直接使用的附件数据
 * 自动解析文本、生成ID、记录元信息
 */
export async function createAttachmentFromFile(file: File): Promise<ExtractedAttachment> {
  const { body, note } = await readFileContent(file)

  return {
    id: createAttachmentId(),
    name: file.name,
    size: file.size,
    mimeType: file.type || 'unknown',
    body,
    note,
    addedAt: Date.now(),
  }
}