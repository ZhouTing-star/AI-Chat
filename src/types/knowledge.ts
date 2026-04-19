/**
 * 知识库信息实体
 * 用于展示和管理整个知识库的基础信息、存储、模型、任务状态
 */
export interface KnowledgeBase {
  id: string;                // 知识库唯一ID
  name: string;              // 知识库名称
  status: string;            // 知识库状态（如：就绪/构建中/异常）
  docs: number;              // 文档总数
  chunks: number;            // 向量切片总数（向量化后的片段数量）
  updatedAt: string;         // 最后更新时间
  storageUsed: string;       // 已使用存储大小（带单位，如 15MB）
  storageTotal: string;      // 总存储上限（带单位）
  embeddingModel: string;    // 向量化模型名称
  embeddingDims: number;     // 向量维度
  indexJobs: number;         // 正在执行的索引构建任务数
  isActive: boolean;         // 是否为当前激活/默认知识库
  engineVersion: number;     // 知识库引擎版本（用于兼容升级）
  lastRebuildAt: string;    // 最近一次重建索引时间
}

/**
 * 知识库中的文档项
 * 代表用户上传到知识库的单个文件信息
 */
export interface DocumentItem {
  id: string;                // 文档唯一ID
  kbId: string;              // 所属知识库ID
  name: string;              // 文档名称（文件名）
  size: string;              // 文档大小（带单位，如 2.5MB）
  chunks: number;            // 本文档被切分的片段数量
  updatedAt: string;         // 最后更新/向量化时间
  isActive: boolean;         // 文档是否启用（可被检索）
}

/**
 * 检索结果项
 * RAG 检索返回的匹配片段信息
 */
export interface SearchResult {
  id: string;                // 检索结果唯一ID
  kbId: string;              // 来源知识库ID
  docId: string;             // 来源文档ID
  source: string;            // 来源文档名称/路径
  content: string;           // 匹配到的文本片段内容
  score: number;             // 相似度评分（越高越匹配）
}

/**
 * 知识库检索模式
 * 控制 AI 如何从知识库中查找相关信息
 */
export type RetrievalMode =
  | 'hybrid'    // 混合检索（向量 + 关键词，默认）
  | 'vector'    // 纯向量检索
  | 'off';      // 关闭检索（不使用知识库）