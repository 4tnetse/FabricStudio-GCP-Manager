import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiGet, apiPost } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Subnet {
  name: string
  network: string
  cidr: string
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCloudRunSubnets(region: string, enabled: boolean) {
  return useQuery({
    queryKey: ['cloud-run', 'subnets', region],
    queryFn: () => apiGet<Subnet[]>(`/cloud-run/subnets?region=${encodeURIComponent(region)}`),
    enabled: enabled && !!region,
    staleTime: 60_000,
    retry: false,
  })
}

export function useStartDeploy() {
  return useMutation({
    mutationFn: ({ region, subnet }: { region: string; subnet: string }) =>
      apiPost<{ deploy_id: string }>('/cloud-run/deploy', { region, subnet }),
  })
}

export function useStartUndeploy() {
  return useMutation({
    mutationFn: () => apiPost<{ undeploy_id: string }>('/cloud-run/undeploy', {}),
  })
}

// ---------------------------------------------------------------------------
// Deploy stream hook
// Connects to the SSE stream for a deploy job.
// Lines starting with __URL: are intercepted and passed to onUrl instead of
// being added to the log.
// ---------------------------------------------------------------------------

export interface DeployStreamResult {
  lines: string[]
  isStreaming: boolean
  failed: boolean
  error: string | null
}

export function useDeployStream(
  streamUrl: string | null,
  onUrl: (url: string) => void,
): DeployStreamResult {
  const [lines, setLines] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onUrlRef = useRef(onUrl)
  onUrlRef.current = onUrl

  useEffect(() => {
    if (!streamUrl) {
      setLines([])
      setIsStreaming(false)
      setFailed(false)
      setError(null)
      return
    }

    setLines([])
    setIsStreaming(true)
    setFailed(false)
    setError(null)

    const es = new EventSource(streamUrl)
    let done = false

    es.onmessage = (event: MessageEvent) => {
      const data: string = event.data
      if (data === '__DONE__') {
        done = true
        setIsStreaming(false)
        es.close()
        return
      }
      if (data === '__FAILED__') {
        done = true
        setIsStreaming(false)
        setFailed(true)
        es.close()
        return
      }
      if (data.startsWith('__URL:')) {
        onUrlRef.current(data.slice(6))
        return
      }
      setLines((prev) => [...prev, data])
    }

    es.onerror = () => {
      if (!done) setError('Stream connection error')
      setIsStreaming(false)
      es.close()
    }

    return () => {
      es.close()
    }
  }, [streamUrl])

  return { lines, isStreaming, failed, error }
}
