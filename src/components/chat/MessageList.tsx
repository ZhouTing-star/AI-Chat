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

interface MessageListProps {
  messages: ChatMessage[]
}

interface RowData {
  messages: ChatMessage[]
  setRowSize: (index: number, size: number) => void
}

const ESTIMATED_ITEM_HEIGHT = 132
const AUTO_RESUME_DISTANCE = 120

function MessageRow({ index, style, messages, setRowSize }: RowComponentProps<RowData>) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const message = messages[index]

  useEffect(() => {
    const element = rowRef.current
    if (!element) {
      return
    }

    const measure = () => {
      const height = Math.ceil(element.getBoundingClientRect().height)
      setRowSize(index, height)
    }

    measure()

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

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => fn(...args), wait)
  }
}

export function MessageList({ messages }: MessageListProps) {
  const listRef = useListRef(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const shouldFollowRef = useRef(true)
  const [rowSizes, setRowSizes] = useState<Record<number, number>>({})
  const [listHeight, setListHeight] = useState(0)
  const [renderRange, setRenderRange] = useState({ start: 0, stop: -1 })

  const isNearBottom = useCallback((element: HTMLDivElement) => {
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    return distance <= AUTO_RESUME_DISTANCE
  }, [])

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

  const getRowHeight = useCallback(
    (index: number) => rowSizes[index] ?? ESTIMATED_ITEM_HEIGHT,
    [rowSizes],
  )

  const itemData = useMemo<RowData>(() => ({
    messages,
    setRowSize,
  }), [messages, setRowSize])

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

  useEffect(() => {
    if (listHeight <= 0) {
      return
    }

    const element = listRef.current?.element
    if (!element) {
      return
    }

    const onScroll = () => {
      shouldFollowRef.current = isNearBottom(element)
    }

    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [isNearBottom, listHeight, listRef])

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    if (!shouldFollowRef.current) {
      return
    }

    const scrollToBottom = debounce(() => {
      listRef.current?.scrollToRow({
        index: messages.length - 1,
        align: 'end',
        behavior: 'auto',
      })
    }, 24)

    scrollToBottom()
  }, [messages, listRef])

  const renderedCount =
    renderRange.stop >= renderRange.start ? renderRange.stop - renderRange.start + 1 : 0

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
