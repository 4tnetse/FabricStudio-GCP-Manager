import { useState, useEffect, useRef } from 'react'

export interface SSEStreamResult {
  lines: string[]
  isStreaming: boolean
  error: string | null
}

export function useSSEStream(url: string | null): SSEStreamResult {
  const [lines, setLines] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!url) {
      setLines([])
      setIsStreaming(false)
      setError(null)
      return
    }

    setLines([])
    setIsStreaming(true)
    setError(null)

    const es = new EventSource(url)
    esRef.current = es
    let done = false

    const handleData = (data: string) => {
      if (data === '__DONE__' || data === '__FAILED__') {
        done = true
        setIsStreaming(false)
        es.close()
        return
      }
      setLines((prev) => [...prev, data])
    }

    es.onmessage = (event: MessageEvent) => handleData(event.data)
    es.addEventListener('log', (event: MessageEvent) => handleData(event.data))

    es.onerror = () => {
      // EventSource fires onerror when the server closes the connection normally.
      // Only treat it as an error if we never received the done sentinel.
      if (!done) {
        setError('Stream connection error')
      }
      setIsStreaming(false)
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [url])

  return { lines, isStreaming, error }
}
