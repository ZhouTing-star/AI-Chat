# AI Chat Platform 项目梳理

## 1. 项目概述

AI Chat Platform 是一个前后端分离的智能问答系统，目标是同时覆盖两类能力：

1. 通用对话：基于大模型流式生成，支持多会话与历史管理。
2. 知识增强：基于本地知识库（RAG）做可追溯回答与检索调试。

当前实现分为两条业务链：

1. 对话链：前端发起 `/api/chat/stream`，后端转发上游模型并回推 SSE。
2. 知识链：文档上传到后端解析入库，切片后参与向量/关键词混合检索。

此外，对话输入支持“会话内附件解析注入”：前端可直接解析 PDF/DOCX/TXT/MD 等附件正文，将内容拼接到当次提问上下文中，以提升问答命中率。

---

## 2. 所用技术栈

### 2.1 前端技术栈

1. React 19 + TypeScript + Vite
2. Zustand + persist（会话、消息、UI、主题、用户态持久化）
3. Tailwind CSS 4（界面与响应式）
4. react-window（消息虚拟列表）
5. react-markdown + remark-gfm + react-syntax-highlighter（富文本与代码高亮）
6. pdfjs-dist + JSZip（前端附件文本提取）

### 2.2 后端技术栈

1. Node.js + Express 5
2. axios + eventsource-parser（上游流式接口转发）
3. multer（文件上传）
4. mammoth + pdf-parse（知识库文档解析）
5. better-sqlite3（SQLite 持久化）

### 2.3 检索与数据技术

1. SQLite + FTS5（关键词检索）
2. Embedding 向量检索（余弦相似度）
3. Hybrid 混合检索（向量分 + 关键词分融合）

### 2.4 工程配置

1. TypeScript + ESLint
2. Vite 构建链路与前后端分离脚本

---

## 3. 主要实现功能及如何实现的

### 3.1 多会话管理

1. 支持新建、重命名、删除会话。
2. 每个会话独立维护消息、模式、预览摘要。
3. 会话与消息状态持久化到 localStorage。

实现方式：`sessionStore` 管会话元数据，`chatStore` 维护 `messagesBySession`（Map），`uiStore` 维护页面与输入态。

### 3.2 SSE 流式对话

1. 前端按 chunk 追加回答内容。
2. 支持 done/error/citations 事件。
3. 支持暂停、继续、重新生成。

实现方式：`chatStream.ts` 解析 SSE 事件；`App.tsx` 通过 `streamClosersRef` 与 `streamTasksRef` 管理连接生命周期。

### 3.3 回答模式切换（严格 / 平衡 / 通用）

1. 严格：高阈值命中（0.7）才作答，否则拒答。
2. 平衡：优先知识库（阈值 0.4），不足时可补充。
3. 通用：跳过 RAG，直接大模型回答。

实现方式：前端会话级模式选择，后端 `normalizeChatRetrievalMode` 与 `ragStore.search` 执行对应策略。

### 3.4 会话附件解析与隔离

1. 聊天输入支持上传 txt/md/csv/json/log/pdf/docx。
2. 上传中禁发，防止未完成入库/解析即发问。
3. 附件按 `sessionId` 隔离，删除会话同步清理附件。

实现方式：前端 `attachmentParser.ts` 做文件解析（pdfjs + JSZip）；解析后的正文与说明在发送时拼接入 prompt。

### 3.5 知识库管理与检索测试

1. 知识库列表、启停、文档列表、文档启停、删除文档。
2. 上传文档并入库切片。
3. 支持重建索引与检索测试（Top-K 可视化）。

实现方式：`KnowledgeBasePage.tsx` + `knowledgeApi.ts` 调后端 `/api/rag/*`。

### 3.6 文档解析、切片与入库

1. 后端解析 PDF/DOCX/文本文件正文。
2. 文本按 chunk+overlap 切片。
3. 切片写入 chunks 与 FTS，向量失败时允许降级入库。

实现方式：`server/src/index.js` 负责上传与解析入口，`server/src/ragStore.js` 负责分块入库与索引。

### 3.7 RAG 检索增强回答

1. 向量检索 + FTS 检索融合打分。
2. 结果注入 system prompt 并在回答中展示引用。
3. 支持附件文档白名单检索范围。

实现方式：`ragStore.search` 返回排序结果；`index.js` 注入 RAG prompt；`MessageItem.tsx` 展示引用与透明度徽章。

### 3.8 长对话性能与滚动体验

1. 虚拟列表降低 DOM 开销。
2. 动态行高测量提升渲染准确性。
3. 用户上滑查看历史时自动取消跟随，防止被新消息抢滚。

实现方式：`MessageList.tsx` 使用 `react-window + ResizeObserver`，并做滚动方向与“接近底部”判定。

---

## 4. 技术亮点

1. 对话与知识双链路闭环：从上传、解析、检索、注入到引用展示形成完整可用流程。
2. 模式策略工程化：严格/平衡/通用三态切换，兼顾准确性、可控性与性能。
3. 会话级附件隔离：上传状态与文档上下文不串会话，提升可预测性。
4. 流式交互可恢复：暂停/继续/重生与异常处理机制完整。
5. 前端性能优化到位：虚拟列表 + 反抢滚策略，长对话下仍保持流畅。
6. 兼容性与容错：多厂商 LLM 配置、解析降级入库、向量失败兜底。

---

## 补充说明

1. 当前定位为 MVP，已具备“智能对话 + 本地知识库 + 模式策略 + 引用透明”的核心能力。
2. 后续可扩展方向：鉴权、多租户、对象存储、异步索引队列、生产监控与链路追踪。
