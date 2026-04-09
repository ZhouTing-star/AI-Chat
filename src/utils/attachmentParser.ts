import JSZip from 'jszip'

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfJsLoader: Promise<PdfJsModule> | null = null

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsLoader) {
    pdfJsLoader = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/build/pdf.worker?url'),
    ]).then(([pdfjsLib, worker]) => {
      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
      }
      return pdfjsLib
    })
  }

  return pdfJsLoader
}

export const MAX_FILE_SIZE = 8 * 1024 * 1024
export const MAX_TEXT_PREVIEW = 8000

const ALLOWED_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'pdf',
  'docx',
])

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const ACCEPT_ATTRIBUTE = Array.from(ALLOWED_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',')

interface ParsedContent {
  body: string
  note: string
}

interface ExtractedAttachment extends ParsedContent {
  id: string
  name: string
  size: number
  mimeType: string
  addedAt: number
}

export function formatSize(size = 0): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function truncatePreview(text = ''): ParsedContent {
  const trimmed = text.trim()
  const body = trimmed.slice(0, MAX_TEXT_PREVIEW)
  const note = trimmed.length > MAX_TEXT_PREVIEW ? '内容已截断，仅展示前 8000 字符' : ''

  return { body, note }
}

function readAsText(file: File): Promise<ParsedContent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(truncatePreview((reader.result ?? '').toString()))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

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

async function extractPdfText(file: File): Promise<ParsedContent> {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const chunks: string[] = []

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

    if (chunks.join('\n\n').length > MAX_TEXT_PREVIEW * 1.5) {
      break
    }
  }

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

function getExtension(name = ''): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

function isTextLike(file: File): boolean {
  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

  if (['txt', 'md', 'csv', 'json', 'log'].includes(ext)) return true
  if (type.startsWith('text/')) return true
  if (type.includes('json')) return true

  return false
}

export function isFileTypeAllowed(file: File): boolean {
  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true
  if (type && ALLOWED_MIME_TYPES.has(type)) return true

  return false
}

async function readFileContent(file: File): Promise<ParsedContent> {
  if (isTextLike(file)) {
    return readAsText(file)
  }

  const ext = getExtension(file.name || '')
  const type = (file.type || '').toLowerCase()

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

  return {
    body: '',
    note: '该文件类型暂无文本解析，已附带元信息。',
  }
}

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
