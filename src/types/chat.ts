export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'done' | 'streaming' | 'paused'

export type MessageType = 'text' | 'image' | 'file'

export interface MessageCitation {
  id: string
  source: string
  content: string
  score: number
}


/**
 * 单条聊天消息对象结构
 * 前端展示一条消息的完整数据
 */
export interface ChatMessage {
  id: string            // 消息唯一ID
  role: MessageRole     // 发送者角色（user/assistant/system）
  content: string       // 消息文本内容
  createdAt: string     // 创建时间（ISO格式字符串）
  status?: MessageStatus // 消息状态：流式中/已完成
  type?: MessageType     // 消息类型：文本/图片/文件
  imageUrl?: string      // 图片地址（type=image时使用）
  fileName?: string      // 文件名（type=file时使用）
  fileUrl?: string       // 文件下载地址（type=file时使用）
  citations?: MessageCitation[] // RAG 命中引用来源
}

/**
 * 聊天会话（对话窗口）对象结构
 * 代表左侧会话列表里的一个对话
 */
export interface ChatSession {
  id: string        // 会话唯一ID
  title: string     // 会话标题（如“新对话”）
  updatedAt: string // 最后更新时间
  preview: string   // 会话预览（显示最后一条消息）
  model: string     // 该会话使用的AI模型名称
}

/**
 * 文件上传状态类型
 * 标识文件正在上传的各个阶段
 */
export type UploadStatus =
  | 'queued'    // 排队等待上传
  | 'uploading' // 正在上传
  | 'done'      // 上传完成
  | 'failed'    // 上传失败

/**
 * 文件上传项对象结构
 * 用于管理上传文件的状态、进度、名称等
 */
export interface UploadItem {
  id: string        // 文件唯一ID
  name: string      // 文件名
  size: number      // 文件大小（字节）
  progress: number  // 上传进度 0~100
  status: UploadStatus // 当前上传状态
}