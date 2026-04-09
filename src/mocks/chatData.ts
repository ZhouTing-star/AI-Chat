import type { ChatMessage, ChatSession } from '../types/chat'

export const mockSessions: ChatSession[] = [
  {
    id: 's-1',
    title: '产品需求讨论',
    updatedAt: '09:38',
    preview: '我先帮你梳理产品 MVP 范围。',
    model: 'glm-4-flash',
    answerMode: 'balanced',
  },
  {
    id: 's-2',
    title: '前端性能优化',
    updatedAt: '昨天',
    preview: '建议先做消息列表虚拟滚动。',
    model: 'glm-4-flash',
    answerMode: 'balanced',
  },
  {
    id: 's-3',
    title: '多语言文案检查',
    updatedAt: '周五',
    preview: '已完成 zh-CN 与 en-US 对照。',
    model: 'glm-4-flash',
    answerMode: 'balanced',
  },
]

export const mockMessagesBySession: Record<string, ChatMessage[]> = {
  's-1': [
    {
      id: 'm-1',
      role: 'assistant',
      content: '你好，我可以协助你规划 AI 聊天平台的页面结构与技术实施路径。',
      createdAt: '09:30',
      status: 'done',
    },
    {
      id: 'm-2',
      role: 'user',
      content: '先帮我把前端页面骨架搭起来。',
      createdAt: '09:31',
      status: 'done',
    },
    {
      id: 'm-3',
      role: 'assistant',
      content: '可以，建议先交付会话栏、消息区、输入区三大模块，再补齐移动端抽屉布局。',
      createdAt: '09:31',
      status: 'done',
    },
  ],
  's-2': [
    {
      id: 'm-4',
      role: 'user',
      content: '长对话卡顿怎么优化？',
      createdAt: '22:10',
      status: 'done',
    },
    {
      id: 'm-5',
      role: 'assistant',
      content: '优先引入虚拟列表并降低无效渲染，配合图片懒加载和 memo。',
      createdAt: '22:10',
      status: 'done',
    },
  ],
  's-3': [],
}
