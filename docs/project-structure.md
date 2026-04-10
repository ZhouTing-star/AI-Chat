# AI Chat Platform 项目结构与文件职责

本文用于说明项目中主要目录与文件的作用，便于新成员快速定位代码。

## 1. 根目录

- `.env.example`：前端运行时环境变量模板。
- `index.html`：Vite 应用入口 HTML。
- `package.json`：前端工程依赖与脚本定义。
- `package-lock.json`：依赖锁定文件。
- `vite.config.ts`：Vite 配置。
- `eslint.config.js`：ESLint 规则配置。
- `tsconfig.json`：TypeScript 基础配置。
- `tsconfig.app.json`：前端应用 TS 配置。
- `tsconfig.node.json`：Node 侧 TS 配置。
- `README.md`：项目总览与启动说明。
- `skills-lock.json`：技能锁定配置。
- `.gitignore`：Git 忽略规则。

说明：
- `dist` 为构建产物目录。
- `node_modules` 为依赖目录。
- `.git` 为版本控制目录。
- `.agents` 为本地 agent/技能相关目录。

## 2. 文档目录 docs

- `project-overview.md`：项目概述、技术栈、功能实现与技术亮点。
- `project-structure.md`：当前文件，说明项目结构与职责分工。

## 3. 前端目录 src

### 3.1 入口与样式

- `main.tsx`：React 挂载入口，注入 ErrorBoundary。
- `App.tsx`：应用主编排文件，负责会话、流式对话、模式切换、附件发送链路。
- `index.css`：全局样式。
- `App.css`：应用级样式。
- `assets`：静态资源目录。

### 3.2 组件目录 components

#### chat
- `ChatInput.tsx`：输入区、模式切换、文件选择与发送按钮。
- `MessageList.tsx`：消息虚拟列表与滚动跟随策略。
- `MessageItem.tsx`：单条消息渲染、Markdown/代码高亮、引用与透明度徽章。
- `UploadPreview.tsx`：上传文件列表、进度与错误信息展示。

#### common
- `ErrorBoundary.tsx`：运行时异常兜底页面。
- `WithPermission.tsx`：权限控制包装组件。

#### knowledge
- `KnowledgeBasePage.tsx`：知识库管理页面（文档上传、启停、重建、测试检索）。

#### layout
- `Sidebar.tsx`：会话侧边栏（新建、切换、重命名、删除）。
- `TopBar.tsx`：顶部工具栏（模式页面切换、暂停继续、导出清空等）。

### 3.3 服务目录 services

- `chatStream.ts`：SSE 客户端封装，处理 chunk/done/error/citations 事件。
- `knowledgeApi.ts`：知识库 REST API 封装（列表、上传、启停、重建、检索测试）。

### 3.4 状态目录 store

- `chatStore.ts`：消息状态管理，按会话维护 Map 结构。
- `sessionStore.ts`：会话状态管理，含创建、改名、删除、模式切换。
- `uiStore.ts`：页面状态、输入状态、上传状态、移动端侧栏状态。
- `themeStore.ts`：主题模式状态。
- `userStore.ts`：用户与权限状态。

### 3.5 类型目录 types

- `chat.ts`：消息、会话、上传、回答模式等核心类型定义。
- `knowledge.ts`：知识库、文档、检索结果类型定义。
- `pdfjs-modules.d.ts`：pdfjs 相关 TS 模块声明。

### 3.6 其他目录

- `mocks/chatData.ts`：会话与消息初始 mock 数据。
- `utils/attachmentParser.ts`：前端附件解析工具（pdfjs/JSZip），支持提取文本并生成发送上下文。

## 4. 后端目录 server

### 4.1 配置与说明

- `.env`：后端本地环境变量。
- `.env.example`：后端环境变量模板。
- `package.json`：后端依赖与脚本。
- `package-lock.json`：后端依赖锁。
- `README.md`：后端运行说明与接口简介。

### 4.2 核心代码 server/src

- `index.js`：后端主入口；包含健康检查、知识库接口、上传解析、SSE 转发、RAG 注入与模式策略。
- `ragStore.js`：SQLite 存储层；负责知识库/文档/切片管理、向量检索与混合检索排序。
- `embeddingClient.js`：Embedding 客户端封装；统一向量接口调用与返回处理。

### 4.3 数据目录 server/data

- `rag.sqlite`：知识库主数据库。
- `rag.sqlite-shm`、`rag.sqlite-wal`：SQLite WAL 模式相关文件。

## 5. 关键调用链路（快速定位）

### 5.1 对话链路

1. `src/components/chat/ChatInput.tsx` 触发发送。
2. `src/App.tsx` 组装上下文并调用 `src/services/chatStream.ts`。
3. `server/src/index.js` 处理 `/api/chat/stream` 并转发上游模型。
4. 前端按 SSE 增量渲染到 `MessageList/MessageItem`。

### 5.2 知识库链路

1. `src/components/knowledge/KnowledgeBasePage.tsx` 触发文档上传。
2. `src/services/knowledgeApi.ts` 调用上传与检索接口。
3. `server/src/index.js` 接收上传，解析文本后调用 `ragStore.ingestDocument`。
4. `server/src/ragStore.js` 完成切片、索引与检索。

### 5.3 会话附件链路

1. `src/components/chat/ChatInput.tsx` 选择附件。
2. `src/App.tsx` 调用 `src/utils/attachmentParser.ts` 提取正文。
3. 发送时将附件正文拼接到 prompt 上下文再走对话链路。
