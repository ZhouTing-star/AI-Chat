# AI Chat Platform

一个前后端分离的 AI 聊天平台 MVP，支持：

- 多会话聊天
- SSE 流式输出
- 本地知识库管理（上传、启停、删除、重建索引）
- RAG 检索增强回答（hybrid/vector/off）

## 项目结构

- `src/`: 前端（React + TypeScript + Vite）
- `server/`: 后端（Express + SQLite + RAG）
- `docs/`: 项目文档

## 快速开始

### 1. 安装依赖

项目根目录：

```bash
npm install
```

后端目录：

```bash
cd server
npm install
```

### 2. 配置环境变量

在 `server/` 下复制模板并填写密钥：

```bash
cp .env.example .env
```

至少需要配置 LLM API Key（或兼容的 `ZHIPU_*` / `QWEN_*` 变量）。

### 3. 启动服务

后端：

```bash
npm run dev:server
```

前端：

```bash
npm run dev
```

## 核心文档

- 完整项目梳理：`docs/project-overview.md`
- 后端说明：`server/README.md`

## 常用脚本

- `npm run dev`：启动前端开发服务
- `npm run dev:server`：启动后端服务
- `npm run build`：构建前端
- `npm run lint`：ESLint 检查
