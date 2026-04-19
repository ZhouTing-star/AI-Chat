import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 错误边界（ErrorBoundary）Props
 * children：需要被保护的子组件
 */
interface ErrorBoundaryProps {
  children: ReactNode
}

/**
 * 错误边界内部状态
 * hasError：是否发生了错误
 * message：错误信息
 */
interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

/**
 * 【错误边界】React 专用组件
 * 作用：
 * 1. 捕获子组件发生的 JS 崩溃错误
 * 2. 防止整个应用白屏
 * 3. 显示友好的错误提示页面
 * 4. 打印错误日志便于排查问题
 */

/**
 * 只有 class 组件 才能做错误边界function 组件无法实现这个功能？
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // 初始化状态：无错误，无信息
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      message: '',
    }
  }

  /**
   * 当子组件抛出错误时 → 更新状态
   * 静态方法，React 自动调用
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  /**
   * 捕获到错误后 → 执行副作用（打印日志）
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary captured error:', error, errorInfo)
  }

  render() {
    // 如果发生错误 → 渲染【友好错误页面】
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-rose-700">页面发生异常</h1>
            <p className="mt-2 text-sm text-slate-700">
              请刷新页面重试。如果问题持续存在，请联系管理员。
            </p>
            <p className="mt-3 rounded bg-rose-50 p-2 text-xs text-rose-700">{this.state.message}</p>
          </div>
        </div>
      )
    }

    // 没有错误 → 正常渲染子组件
    return this.props.children
  }
}