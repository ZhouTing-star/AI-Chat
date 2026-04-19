import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { List, type RowComponentProps, useListRef } from 'react-window'
import { MessageItem } from './MessageItem'
import type { ChatMessage } from '../../types/chat'

// 消息列表 props：接收消息数组
interface MessageListProps {
  messages: ChatMessage[]
}

// 传递给每一行的数据：消息 + 设置行高的方法
interface RowData {
  messages: ChatMessage[]
  setRowSize: (index: number, size: number) => void
}

/**
 * 消息列表里的【每一行】
 * 负责：测量高度、渲染消息、监听高度变化
 */
const ESTIMATED_ITEM_HEIGHT = 132
const AUTO_RESUME_DISTANCE = 120

function MessageRow({ index, style, messages, setRowSize }: RowComponentProps<RowData>) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const message = messages[index]

   // 测量当前消息高度，并监听变化（自动调整）
  useEffect(() => {
    const element = rowRef.current
    if (!element) {
      return
    }

    const measure = () => {
      const height = Math.ceil(element.getBoundingClientRect().height)
      setRowSize(index, height)// 把高度告诉列表
    }

    measure()

    // 监听元素大小变化
    const observer = new ResizeObserver(() => {
      measure()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [index, setRowSize])

  return (
    <div style={style as CSSProperties}>
      <div ref={rowRef}>
        <MessageItem message={message} />
      </div>
    </div>
  )
}
/**
 * 防抖工具：延迟执行，避免频繁触发
 */
function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => fn(...args), wait)
  }
}
/**
 * 聊天消息列表（虚拟滚动 + 自动滚动到底部）
 * 核心功能：
 * 1. 长列表性能优化（只渲染可视区）
 * 2. 自动滚动到底部
 * 3. 用户往上翻时暂停自动滚动
 * 4. 回到底部恢复跟随
 * 5. 自动测量每条消息高度
 */
export function MessageList({ messages }: MessageListProps) {
  const listRef = useListRef(null)          // 虚拟列表实例
  const viewportRef = useRef<HTMLDivElement | null>(null) // 列表容器
  const shouldFollowRef = useRef(true)      // 是否自动滚动到底部
  const previousScrollTopRef = useRef(0)    // 上一次滚动位置
  const programmaticScrollingRef = useRef(false) // 是否是程序自动滚动

  const [rowSizes, setRowSizes] = useState<Record<number, number>>({}) // 每行高度
  const [listHeight, setListHeight] = useState(0) // 列表可视区高度
  const [renderRange, setRenderRange] = useState({ start: 0, stop: -1 }) // 当前渲染范围

  /**
   * 判断是否滚动到了【接近底部】，接近就恢复自动跟随
   */
  const isNearBottom = useCallback((element: HTMLDivElement) => {
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    return distance <= AUTO_RESUME_DISTANCE
  }, [])

  /**
   * 更新某一行的高度
   */
  const setRowSize = useCallback((index: number, size: number) => {
    setRowSizes((prev) => {
      if (prev[index] === size) {
        return prev
      }
      return {
        ...prev,
        [index]: size,
      }
    })
  }, [])

  /**
   * 获取行高：有测量值用测量值，没有用预估
   */
  const getRowHeight = useCallback(
    (index: number) => rowSizes[index] ?? ESTIMATED_ITEM_HEIGHT,
    [rowSizes],
  )

  /**
   * 传给每一行 MessageRow 的数据
   */
  const itemData = useMemo<RowData>(() => ({
    messages,
    setRowSize,
  }), [messages, setRowSize])

  /**
   * 监听容器高度变化，设置列表高度
   */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const updateHeight = () => {
      setListHeight(viewport.clientHeight)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

   /**
   * 监听滚动：
   * - 往上翻 → 停止自动跟随
   * - 回到底部 → 恢复跟随
   */
  useEffect(() => {
    if (listHeight <= 0) {
      return
    }

    const element = listRef.current?.element
    if (!element) {
      return
    }

    const onScroll = () => {
      if (programmaticScrollingRef.current) {
        previousScrollTopRef.current = element.scrollTop
        return
      }

      const currentTop = element.scrollTop
      const delta = currentTop - previousScrollTopRef.current
      previousScrollTopRef.current = currentTop

      // 用户向上查看历史时，立即关闭自动滚动，避免被新消息打断。
      if (delta < 0) {
        shouldFollowRef.current = false
        return
      }

      // 用户回到底部附近时，再恢复自动跟随。
      if (isNearBottom(element)) {
        shouldFollowRef.current = true
      }
    }

    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [isNearBottom, listHeight, listRef])

  /**
   * 消息变化时 → 自动滚动到底部
   */
  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    if (!shouldFollowRef.current) {
      return
    }

    // 防抖：避免频繁滚动
    const scrollToBottom = debounce(() => {
      programmaticScrollingRef.current = true
      listRef.current?.scrollToRow({
        index: messages.length - 1,
        align: 'end',
        behavior: 'auto',
      })

      window.requestAnimationFrame(() => {
        programmaticScrollingRef.current = false
      })
    }, 24)

    scrollToBottom()
  }, [messages, listRef])

  // 当前渲染了多少条（开发环境显示）
  const renderedCount =
    renderRange.stop >= renderRange.start ? renderRange.stop - renderRange.start + 1 : 0

  // 空消息时显示欢迎面板
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8">
          <p className="text-base font-semibold text-slate-900">开启新对话</p>
          <p className="mt-2 text-sm text-slate-600">
            输入你的问题，或先上传文件。后续这里会接入 SSE 实时流式回答。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full px-4 py-5 lg:px-8">
      <div ref={viewportRef} className="h-full">
        {listHeight > 0 && (
          <List
            listRef={listRef}
            rowCount={messages.length}
            rowHeight={getRowHeight}
            rowComponent={MessageRow}
            rowProps={itemData}
            style={{ height: listHeight }}
            overscanCount={4}
            onRowsRendered={(_visibleRows, allRows) => {
              setRenderRange((prev) => {
                if (
                  prev.start === allRows.startIndex &&
                  prev.stop === allRows.stopIndex
                ) {
                  return prev
                }

                return {
                  start: allRows.startIndex,
                  stop: allRows.stopIndex,
                }
              })
            }}
          />
        )}
      </div>

      {import.meta.env.DEV && (
        <div className="pointer-events-none absolute right-6 top-3 rounded bg-slate-900/75 px-2 py-1 text-[11px] text-slate-100">
          rendered {renderedCount}/{messages.length}
        </div>
      )}
    </div>
  )
}
