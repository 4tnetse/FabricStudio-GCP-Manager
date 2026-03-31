import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useSSEStream } from '@/hooks/useSSEStream'
import type { SSEStreamResult } from '@/hooks/useSSEStream'

interface OpsContextValue {
  configure: SSEStreamResult
  setConfigureStreamUrl: (url: string | null) => void
  clone: SSEStreamResult
  setCloneStreamUrl: (url: string | null) => void
  ssh: SSEStreamResult
  setSshStreamUrl: (url: string | null) => void
}

const empty: SSEStreamResult = { lines: [], isStreaming: false, error: null }

const OpsContext = createContext<OpsContextValue>({
  configure: empty,
  setConfigureStreamUrl: () => {},
  clone: empty,
  setCloneStreamUrl: () => {},
  ssh: empty,
  setSshStreamUrl: () => {},
})

export function OpsProvider({ children }: { children: ReactNode }) {
  const [configureStreamUrl, setConfigureStreamUrl] = useState<string | null>(null)
  const [cloneStreamUrl, setCloneStreamUrl] = useState<string | null>(null)
  const [sshStreamUrl, setSshStreamUrl] = useState<string | null>(null)

  const configure = useSSEStream(configureStreamUrl)
  const clone = useSSEStream(cloneStreamUrl)
  const ssh = useSSEStream(sshStreamUrl)

  return (
    <OpsContext.Provider value={{ configure, setConfigureStreamUrl, clone, setCloneStreamUrl, ssh, setSshStreamUrl }}>
      {children}
    </OpsContext.Provider>
  )
}

export function useOps() {
  return useContext(OpsContext)
}
