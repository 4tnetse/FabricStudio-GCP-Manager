import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { useGetUploadUrl, useImportImage, useCleanupStaging } from '@/api/images'
import { useSSEStream } from '@/hooks/useSSEStream'
import { useTheme } from '@/context/ThemeContext'

export type ImportPhase = 'uploading' | 'importing' | 'done' | 'failed'
export type RenamePhase = 'renaming' | 'done' | 'failed'

export interface ImportJob {
  phase: ImportPhase
  imageName: string
  uploadProgress: number
  bucket: string
  objectName: string
  streamUrl: string | null
}

export interface RenameJob {
  id: string
  phase: RenamePhase
  oldName: string
  newName: string
  lines: string[]
}

interface ImportContextValue {
  importJob: ImportJob | null
  setImportJob: (job: ImportJob | null) => void
  lines: string[]
  isStreaming: boolean
  streamError: string | null
  barColor: string
  handleStartImport: (name: string, family: string, description: string, file: File) => Promise<void>
  handleCancelImport: () => void
  renameJobs: RenameJob[]
  dismissRenameJob: (id: string) => void
  handleRenameStarted: (oldName: string, newName: string, jobId: string) => void
}

const ImportContext = createContext<ImportContextValue>({
  importJob: null,
  setImportJob: () => {},
  lines: [],
  isStreaming: false,
  streamError: null,
  barColor: 'bg-blue-500',
  handleStartImport: async () => {},
  handleCancelImport: () => {},
  renameJobs: [],
  dismissRenameJob: () => {},
  handleRenameStarted: () => {},
})

export function ImportProvider({ children }: { children: ReactNode }) {
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [renameJobs, setRenameJobs] = useState<RenameJob[]>([])
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const esMapRef = useRef<Map<string, EventSource>>(new Map())
  const { theme } = useTheme()

  const getUploadUrl = useGetUploadUrl()
  const startImport = useImportImage()
  const cleanupStaging = useCleanupStaging()

  const { lines, isStreaming, error: streamError } = useSSEStream(importJob?.streamUrl ?? null)

  const barColor = theme === 'security-fabric' ? 'bg-[#EE3124]' : 'bg-blue-500'

  // Detect when import streaming ends → mark done/failed
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && importJob?.phase === 'importing') {
      const failed = lines.some(l => l.startsWith('ERROR'))
      setImportJob(j => j ? { ...j, phase: failed ? 'failed' : 'done' } : null)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  function handleRenameStarted(oldName: string, newName: string, jobId: string) {
    const job: RenameJob = { id: jobId, oldName, newName, phase: 'renaming', lines: [] }
    setRenameJobs(prev => [...prev, job])

    const es = new EventSource(`/api/ops/${jobId}/stream`)
    esMapRef.current.set(jobId, es)
    let done = false

    const handleData = (data: string) => {
      if (data === '__DONE__' || data === '__FAILED__') {
        done = true
        es.close()
        esMapRef.current.delete(jobId)
        const failed = data === '__FAILED__'
        setRenameJobs(prev => prev.map(j => j.id === jobId ? { ...j, phase: failed ? 'failed' : 'done' } : j))
        return
      }
      setRenameJobs(prev => prev.map(j => j.id === jobId ? { ...j, lines: [...j.lines, data] } : j))
    }

    es.onmessage = (e: MessageEvent) => handleData(e.data)
    es.addEventListener('log', (e: MessageEvent) => handleData(e.data))
    es.onerror = () => {
      if (!done) {
        setRenameJobs(prev => prev.map(j => j.id === jobId ? { ...j, phase: 'failed' } : j))
      }
      es.close()
      esMapRef.current.delete(jobId)
    }
  }

  function dismissRenameJob(id: string) {
    esMapRef.current.get(id)?.close()
    esMapRef.current.delete(id)
    setRenameJobs(prev => prev.filter(j => j.id !== id))
  }

  async function handleStartImport(name: string, family: string, description: string, file: File) {
    let uploadInfo: { upload_url: string; gcs_uri: string; bucket: string; object_name: string }
    try {
      uploadInfo = await getUploadUrl.mutateAsync(file.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to prepare upload')
      return
    }

    setImportJob({
      phase: 'uploading',
      imageName: name,
      uploadProgress: 0,
      bucket: uploadInfo.bucket,
      objectName: uploadInfo.object_name,
      streamUrl: null,
    })

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    const uploadOk = await new Promise<boolean>((resolve) => {
      xhr.open('PUT', uploadInfo.upload_url)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setImportJob(j => j ? { ...j, uploadProgress: Math.round((e.loaded / e.total) * 100) } : null)
      }
      xhr.onload = () => {
        console.log('[import] XHR onload — status:', xhr.status, xhr.statusText, '— response:', xhr.responseText?.slice(0, 500))
        resolve(xhr.status >= 200 && xhr.status < 300)
      }
      xhr.onerror = () => {
        console.error('[import] XHR onerror — network error')
        resolve(false)
      }
      xhr.onabort = () => {
        console.warn('[import] XHR onabort')
        resolve(false)
      }
      xhr.send(file)
    })

    xhrRef.current = null

    if (!uploadOk) {
      console.error('[import] upload failed or aborted')
      // Aborted by user — state already cleared by handleCancelImport
      setImportJob(prev => prev?.phase === 'uploading' ? null : prev)
      return
    }

    setImportJob(j => j ? { ...j, phase: 'importing', uploadProgress: 100 } : null)

    try {
      const result = await startImport.mutateAsync({
        name,
        gcs_uri: uploadInfo.gcs_uri,
        bucket: uploadInfo.bucket,
        object_name: uploadInfo.object_name,
        family: family || undefined,
        description: description || undefined,
      })
      setImportJob(j => j ? { ...j, streamUrl: `/api/ops/${result.job_id}/stream` } : null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start import')
      setImportJob(j => j ? { ...j, phase: 'failed' } : null)
    }
  }

  function handleCancelImport() {
    xhrRef.current?.abort()
    xhrRef.current = null
    if (importJob?.bucket && importJob?.objectName) {
      cleanupStaging.mutate({ bucket: importJob.bucket, object_name: importJob.objectName })
    }
    setImportJob(null)
  }

  return (
    <ImportContext.Provider value={{
      importJob, setImportJob,
      lines, isStreaming, streamError,
      barColor,
      handleStartImport, handleCancelImport,
      renameJobs, dismissRenameJob,
      handleRenameStarted,
    }}>
      {children}
    </ImportContext.Provider>
  )
}

export function useImport() {
  return useContext(ImportContext)
}
