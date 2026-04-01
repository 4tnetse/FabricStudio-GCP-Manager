import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSSEStream } from '@/hooks/useSSEStream'
import type { SSEStreamResult } from '@/hooks/useSSEStream'
import { useDeployStream } from '@/api/cloudrun'
import type { DeployStreamResult } from '@/api/cloudrun'

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

  deploy: DeployStreamResult
  deployStreamUrl: string | null
  setDeployStreamUrl: (url: string | null) => void
  deployJob: OpsJob | null
  startDeployJob: (label: string) => void
  dismissDeployJob: () => void
  deployedUrl: string | null
  clearDeployedUrl: () => void

  undeploy: DeployStreamResult
  undeployStreamUrl: string | null
  setUndeployStreamUrl: (url: string | null) => void
  undeployJob: OpsJob | null
  startUndeployJob: (label: string) => void
  dismissUndeployJob: () => void
}

const emptySSE: SSEStreamResult = { lines: [], isStreaming: false, error: null }
const emptyDeploy: DeployStreamResult = { lines: [], isStreaming: false, failed: false, error: null }

const OpsContext = createContext<OpsContextValue>({
  configure: emptySSE,
  setConfigureStreamUrl: () => {},
  configureJob: null,
  startConfigureJob: () => {},
  dismissConfigureJob: () => {},

  clone: emptySSE,
  setCloneStreamUrl: () => {},
  cloneJob: null,
  startCloneJob: () => {},
  dismissCloneJob: () => {},

  ssh: emptySSE,
  setSshStreamUrl: () => {},
  sshJob: null,
  startSshJob: () => {},
  dismissSshJob: () => {},

  deploy: emptyDeploy,
  deployStreamUrl: null,
  setDeployStreamUrl: () => {},
  deployJob: null,
  startDeployJob: () => {},
  dismissDeployJob: () => {},
  deployedUrl: null,
  clearDeployedUrl: () => {},

  undeploy: emptyDeploy,
  undeployStreamUrl: null,
  setUndeployStreamUrl: () => {},
  undeployJob: null,
  startUndeployJob: () => {},
  dismissUndeployJob: () => {},
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

function useDeployOpsJob(stream: DeployStreamResult): [OpsJob | null, (label: string) => void, () => void] {
  const [job, setJob] = useState<OpsJob | null>(null)
  const wasStreamingRef = useRef(false)

  useEffect(() => {
    if (wasStreamingRef.current && !stream.isStreaming && job?.phase === 'running') {
      setJob(j => j ? { ...j, phase: stream.failed ? 'failed' : 'done' } : null)
    }
    wasStreamingRef.current = stream.isStreaming
  }, [stream.isStreaming, stream.failed])

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
  const [deployStreamUrl, setDeployStreamUrl] = useState<string | null>(null)
  const [undeployStreamUrl, setUndeployStreamUrl] = useState<string | null>(null)
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null)

  const configure = useSSEStream(configureStreamUrl)
  const clone = useSSEStream(cloneStreamUrl)
  const ssh = useSSEStream(sshStreamUrl)
  const deploy = useDeployStream(deployStreamUrl, (url) => setDeployedUrl(url))
  const undeploy = useDeployStream(undeployStreamUrl, () => {})

  const [configureJob, startConfigureJob, dismissConfigureJob] = useOpsJob(configure)
  const [cloneJob, startCloneJob, dismissCloneJob] = useOpsJob(clone)
  const [sshJob, startSshJob, dismissSshJob] = useOpsJob(ssh)
  const [deployJob, startDeployJob, dismissDeployJob] = useDeployOpsJob(deploy)
  const [undeployJob, startUndeployJob, dismissUndeployJob] = useDeployOpsJob(undeploy)

  function clearDeployedUrl() {
    setDeployedUrl(null)
  }

  return (
    <OpsContext.Provider value={{
      configure, setConfigureStreamUrl, configureJob, startConfigureJob, dismissConfigureJob,
      clone, setCloneStreamUrl, cloneJob, startCloneJob, dismissCloneJob,
      ssh, setSshStreamUrl, sshJob, startSshJob, dismissSshJob,
      deploy, deployStreamUrl, setDeployStreamUrl, deployJob, startDeployJob, dismissDeployJob, deployedUrl, clearDeployedUrl,
      undeploy, undeployStreamUrl, setUndeployStreamUrl, undeployJob, startUndeployJob, dismissUndeployJob,
    }}>
      {children}
    </OpsContext.Provider>
  )
}

export function useOps() {
  return useContext(OpsContext)
}
