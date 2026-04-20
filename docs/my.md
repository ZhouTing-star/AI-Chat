适用对象：

+ React 初学者 / 基础薄弱的前端同学
+ 使用 React + Vite / CRA / Umi / Next.js，但**不知道代码该写在哪**
+ 能写组件，但对项目结构、职责边界没有概念

大多数 React 新手的问题不是：

+ 不会 useEffect
+ 不会 useState

而是这个：

**不知道一段代码“从工程角度”应该属于哪里**

你需要先建立一个认知：

**React 项目 = 职责划分，而不是组件堆叠**

## 一个标准 React 项目的目录结构（先建立全局感）
以 React + Vite 为例（Umi / CRA 类似）：

技术栈不是关键，不用觉得 nextjs 比 react 高级，面试官假设问你一句为什么不用普通 react 写呢

```plain
src/
├── main.tsx           // 应用入口
├── App.tsx            // 应用外壳
├── router/            // 路由配置
│   └── index.tsx
├── pages/             // 页面级组件
│   └── Login/index.tsx
├── components/        // 通用组件
│   └── BaseButton.tsx
├── services/          // 接口请求（api）
│   └── user.ts
├── store/             // 全局状态（Redux / Zustand）
│   └── userStore.ts
├── hooks/             // 自定义 hooks
│   └── useRequest.ts
├── utils/             // 工具函数
│   └── format.ts
├── styles/            // 全局样式
│   └── index.scss
└── assets/            // 静态资源
```

你现在不用全部理解，但你需要知道：

**每个目录都有“禁止越界”的职责边界**

下面逐个解释。

## main.tsx：只负责“把应用跑起来”
### 它的唯一职责
**创建 React 应用 + 挂载到 DOM**

### 允许写什么
+ ReactDOM.createRoot
+ Provider（Redux / Zustand / Query）
+ Router 包裹

### 严禁写什么
+ 业务逻辑
+ 页面逻辑
+ 接口请求

### 心智模型
main.tsx = 应用的电源按钮

你不可能在电源按钮里写业务代码。

## App.tsx：应用的“壳”，不是页面
### App.tsx 是干嘛的
**定义应用整体结构**

常见内容：

+ 路由出口（Outlet / Routes）
+ 全局 Layout（Header / Sidebar）
+ 全局异常兜底

### 不该写的内容
+ 表单提交逻辑
+ 页面接口调用
+ 具体业务流程

### 判断口诀
如果这是“某一个页面的功能”，就不该写在 App.tsx

## pages/：真正的“页面”只允许放这里
### 什么是页面（非常关键）
满足任一条件：

+ 对应一个路由
+ 有 URL
+ 刷新后可以重新进入

那么它 **必须** 是 pages 下的文件

### 页面里可以写什么
+ 页面级状态
+ 页面接口调用（通过 services）
+ 页面事件（提交、跳转）

### 页面里不该写什么
+ 可复用组件
+ 通用工具函数

### 一个重要原则
**删掉这个文件，这个页面就不存在了**

## components/：可复用 UI 的唯一归宿
### 什么样的组件才能进 components
至少满足一个条件：

+ 被多个页面使用
+ 不强依赖业务数据
+ 只关注 UI 和交互

### 典型组件
+ Button / Modal / Table
+ FormItem
+ 通用弹窗

### 新手常犯错误
把“只在某一个页面使用的复杂业务组件”放进 components

### 正确做法
页面专属组件 → pages/xxx/components/

## services/（api）：接口只能写在这里
### services 的定位
**接口 = 一个函数，而不是一段逻辑**

### 正确示例
```jsx
export function login(params) {
  return request.post('/login', params)
}
```

### 禁止行为
+ 在 services 里写页面逻辑
+ 在 services 里处理 UI

### 好处（面试重点）
+ 页面与接口解耦
+ 接口可复用
+ 方便 mock / 统一维护

## store/：跨页面共享状态的唯一位置
### 什么时候必须用 store
+ 多页面共享数据
+ 登录态 / 用户信息
+ 全局配置数据

### 不要滥用 store
+ 单页面状态不要放进去
+ 表单状态不要放进去

### 一句话定义
store = 全局数据源，不是业务页面

## hooks/：复用“逻辑”，而不是 UI
### hooks 解决什么问题
当你发现：

+ 多个地方有一模一样的 useEffect + useState

那就应该抽成 hook

### 示例
+ useRequest
+ useDebounce
+ usePagination

### 错误理解
hook 不是组件的替代品

## utils/：纯函数集中地
### utils 的特征
+ 输入确定
+ 输出确定
+ 无副作用

### 示例
+ 日期格式化
+ 防抖 / 节流
+ 数据转换

### 禁止事项
+ 写请求
+ 操作 store

## 最重要的三步定位法（可以稍微做一下记忆）
当你不知道一段代码写在哪，按顺序问：

1. 这是一个页面吗？
    - 是 → pages
2. 这是可复用的 UI 吗？
    - 是 → components
3. 这是纯逻辑或工具吗？
    - 是 → hooks / utils

都不是：

+ 接口 → services
+ 全局状态 → store

## 怎么练习这一块
1. 手动搭一个空 React 项目
2. 只做一个登录页面
3. 强制自己按目录职责写代码
4. 每写一段代码就自查一下：这段代码是不是越界了？


