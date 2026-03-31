import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSSEStream } from '@/hooks/useSSEStream'
import type { SSEStreamResult } from '@/hooks/useSSEStream'

export type OpsPhase = 'running' | 'done' | 'failed'

export interface OpsJob {
  phase: OpsPhase
  label: string
}

interface OpsContextValue {
  configure: SSEStreamResult
  setConfigureStreamUrl: (url: string | null) => void
  configureJob: OpsJob | null
  startConfigureJob: (label: string) => void
  dismissConfigureJob: () => void

  clone: SSEStreamResult
  setCloneStreamUrl: (url: string | null) => void
  cloneJob: OpsJob | null
  startCloneJob: (label: string) => void
  dismissCloneJob: () => void

  ssh: SSEStreamResult
  setSshStreamUrl: (url: string | null) => void
  sshJob: OpsJob | null
  startSshJob: (label: string) => void
  dismissSshJob: () => void
}

const empty: SSEStreamResult = { lines: [], isStreaming: false, error: null }

const OpsContext = createContext<OpsContextValue>({
  configure: empty,
  setConfigureStreamUrl: () => {},
  configureJob: null,
  startConfigureJob: () => {},
  dismissConfigureJob: () => {},

  clone: empty,
  setCloneStreamUrl: () => {},
  cloneJob: null,
  startCloneJob: () => {},
  dismissCloneJob: () => {},

  ssh: empty,
  setSshStreamUrl: () => {},
  sshJob: null,
  startSshJob: () => {},
  dismissSshJob: () => {},
})

function useOpsJob(stream: SSEStreamResult): [OpsJob | null, (label: string) => void, () => void] {
  const [job, setJob] = useState<OpsJob | null>(null)
  const wasStreamingRef = useRef(false)

  useEffect(() => {
    if (wasStreamingRef.current && !stream.isStreaming && job?.phase === 'running') {
      const failed = stream.lines.some(l => l.startsWith('ERROR'))
      setJob(j => j ? { ...j, phase: failed ? 'failed' : 'done' } : null)
    }
    wasStreamingRef.current = stream.isStreaming
  }, [stream.isStreaming])

  function start(label: string) {
    setJob({ phase: 'running', label })
  }

  function dismiss() {
    setJob(null)
  }

  return [job, start, dismiss]
}

export function OpsProvider({ children }: { children: ReactNode }) {
  const [configureStreamUrl, setConfigureStreamUrl] = useState<string | null>(null)
  const [cloneStreamUrl, setCloneStreamUrl] = useState<string | null>(null)
  const [sshStreamUrl, setSshStreamUrl] = useState<string | null>(null)

  const configure = useSSEStream(configureStreamUrl)
  const clone = useSSEStream(cloneStreamUrl)
  const ssh = useSSEStream(sshStreamUrl)

  const [configureJob, startConfigureJob, dismissConfigureJob] = useOpsJob(configure)
  const [cloneJob, startCloneJob, dismissCloneJob] = useOpsJob(clone)
  const [sshJob, startSshJob, dismissSshJob] = useOpsJob(ssh)

  return (
    <OpsContext.Provider value={{
      configure, setConfigureStreamUrl, configureJob, startConfigureJob, dismissConfigureJob,
      clone, setCloneStreamUrl, cloneJob, startCloneJob, dismissCloneJob,
      ssh, setSshStreamUrl, sshJob, startSshJob, dismissSshJob,
    }}>
      {children}
    </OpsContext.Provider>
  )
}

export function useOps() {
  return useContext(OpsContext)
}
