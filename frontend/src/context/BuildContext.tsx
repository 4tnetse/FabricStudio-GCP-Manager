import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { apiPost } from '@/api/client'
import { useSSEStream } from '@/hooks/useSSEStream'

export type BuildPhase = 'building' | 'done' | 'failed'

export interface BuildJob {
  phase: BuildPhase
  instanceName: string
  streamUrl: string
}

export interface BuildFormSnapshot {
  prepend: string
  product: string
  zone: string
  machineType: string
  image: string
  diskSizeGb: string
  group: string
  labels: { key: string; value: string }[]
}

interface BuildContextValue {
  buildJob: BuildJob | null
  setBuildJob: (job: BuildJob | null) => void
  buildFormSnapshot: BuildFormSnapshot | null
  lines: string[]
  isStreaming: boolean
  streamError: string | null
  handleStartBuild: (payload: Record<string, unknown>, instanceName: string, snapshot: BuildFormSnapshot) => Promise<void>
  handleDismiss: () => void
}

const BuildContext = createContext<BuildContextValue>({
  buildJob: null,
  setBuildJob: () => {},
  buildFormSnapshot: null,
  lines: [],
  isStreaming: false,
  streamError: null,
  handleStartBuild: async () => {},
  handleDismiss: () => {},
})

export function BuildProvider({ children }: { children: ReactNode }) {
  const [buildJob, setBuildJob] = useState<BuildJob | null>(null)
  const [buildFormSnapshot, setBuildFormSnapshot] = useState<BuildFormSnapshot | null>(null)

  const { lines, isStreaming, error: streamError } = useSSEStream(buildJob?.streamUrl ?? null)

  // Detect when streaming ends → mark done/failed
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && buildJob?.phase === 'building') {
      const failed = lines.some(l => l.startsWith('ERROR'))
      setBuildJob(j => j ? { ...j, phase: failed ? 'failed' : 'done' } : null)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  async function handleStartBuild(payload: Record<string, unknown>, instanceName: string, snapshot: BuildFormSnapshot) {
    try {
      const result = await apiPost<{ job_id: string }>('/ops/build', payload)
      setBuildFormSnapshot(snapshot)
      setBuildJob({
        phase: 'building',
        instanceName,
        streamUrl: `/api/ops/${result.job_id}/stream`,
      })
      toast.success('Build started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Build failed')
    }
  }

  function handleDismiss() {
    setBuildJob(null)
    setBuildFormSnapshot(null)
  }

  return (
    <BuildContext.Provider value={{
      buildJob, setBuildJob,
      buildFormSnapshot,
      lines, isStreaming, streamError,
      handleStartBuild, handleDismiss,
    }}>
      {children}
    </BuildContext.Provider>
  )
}

export function useBuild() {
  return useContext(BuildContext)
}
