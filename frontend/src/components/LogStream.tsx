import { useEffect, useRef } from 'react'
import { useSSEStream } from '@/hooks/useSSEStream'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogStreamProps {
  url: string | null
  className?: string
  minHeight?: string
  onStreamingChange?: (isStreaming: boolean) => void
}

export function LogStream({ url, className, minHeight = 'min-h-64', onStreamingChange }: LogStreamProps) {
  const { lines, isStreaming, error } = useSSEStream(url)

  useEffect(() => {
    onStreamingChange?.(isStreaming)
  }, [isStreaming, onStreamingChange])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines])

  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-500 text-sm',
          minHeight,
          className,
        )}
      >
        Output will appear here after starting the operation.
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-slate-700 bg-slate-950 overflow-hidden flex flex-col', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        {isStreaming ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span className="text-xs text-slate-400">Streaming output...</span>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-red-400">{error}</span>
          </>
        ) : lines.length > 0 ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400">Completed</span>
          </>
        ) : (
          <span className="text-xs text-slate-500">Waiting...</span>
        )}
        <span className="ml-auto text-xs text-slate-600">{lines.length} lines</span>
      </div>
      <pre
        className={cn(
          'p-3 text-xs font-mono text-slate-300 overflow-auto flex-1',
          minHeight,
        )}
      >
        {lines.length === 0 && !isStreaming ? (
          <span className="text-slate-600">No output yet...</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="leading-5">
              {line || '\u00A0'}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </pre>
    </div>
  )
}
