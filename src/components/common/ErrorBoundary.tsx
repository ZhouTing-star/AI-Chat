import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      message: '',
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary captured error:', error, errorInfo)
  }

  render() {
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

    return this.props.children
  }
}
