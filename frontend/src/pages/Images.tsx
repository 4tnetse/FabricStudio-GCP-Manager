import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useImages, useUpdateImageDescription, useUpdateImageFamily, useDeleteImage, useRenameImage } from '@/api/images'
import { useImport } from '@/context/ImportContext'
import {
  AlertCircle, Check, CheckCircle2, HardDrive, Loader2, Pencil, RefreshCw, Trash2, Upload, X,
} from 'lucide-react'
import { DocLink } from '@/components/DocLink'

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function DescriptionCell({ name, description }: { name: string; description: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(description)
  const update = useUpdateImageDescription()

  async function handleSave() {
    try {
      await update.mutateAsync({ name, description: value })
      toast.success('Description updated')
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update description')
    }
  }

  function handleCancel() {
    setValue(description)
    setEditing(false)
  }

  if (editing) {
    return (
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="flex-1 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
          />
          <button onClick={handleSave} disabled={update.isPending} className="text-green-400 hover:text-green-300 disabled:opacity-50">
            {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    )
  }

  return (
    <td className="px-3 py-2.5 text-slate-400 max-w-xs">
      <div className="flex items-center gap-1.5">
        <span className="truncate">{description || '—'}</span>
        <button
          onClick={() => { setValue(description); setEditing(true) }}
          className="text-slate-500 hover:text-slate-300 shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </td>
  )
}

function FamilyCell({ name, family }: { name: string; family: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(family)
  const update = useUpdateImageFamily()

  async function handleSave() {
    try {
      await update.mutateAsync({ name, family: value })
      toast.success('Family updated')
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update family')
    }
  }

  function handleCancel() {
    setValue(family)
    setEditing(false)
  }

  if (editing) {
    return (
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="flex-1 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
          />
          <button onClick={handleSave} disabled={update.isPending} className="text-green-400 hover:text-green-300 disabled:opacity-50">
            {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    )
  }

  return (
    <td className="px-3 py-2.5 text-slate-400">
      <div className="flex items-center gap-1.5">
        <span>{family || '—'}</span>
        <button
          onClick={() => { setValue(family); setEditing(true) }}
          className="text-slate-500 hover:text-slate-300 shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </td>
  )
}

function NameCell({ name }: { name: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const rename = useRenameImage()

  async function handleSave() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) { setEditing(false); return }
    try {
      await rename.mutateAsync({ name, newName: trimmed })
      toast.success(`Image renamed to '${trimmed}'`)
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename image')
    }
  }

  function handleCancel() {
    setValue(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="flex-1 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
          />
          <button onClick={handleSave} disabled={rename.isPending} className="text-green-400 hover:text-green-300 disabled:opacity-50">
            {rename.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleCancel} disabled={rename.isPending} className="text-slate-500 hover:text-slate-300 disabled:opacity-50"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    )
  }

  return (
    <td className="px-3 py-2.5 font-mono text-slate-200">
      <div className="flex items-center gap-1.5">
        <span>{name}</span>
        <button
          onClick={() => { setValue(name); setEditing(true) }}
          className="text-slate-500 hover:text-slate-300 shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </td>
  )
}

// ── Inline log display (used inside ImportDialog) ──────────────────────────
function LogDisplay({ lines, isStreaming, error }: { lines: string[]; isStreaming: boolean; error: string | null }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden flex flex-col min-h-48 max-h-80">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        {isStreaming ? (
          <><Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" /><span className="text-xs text-slate-400">Streaming output…</span></>
        ) : error ? (
          <><AlertCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-xs text-red-400">{error}</span></>
        ) : lines.length > 0 ? (
          <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">Completed</span></>
        ) : (
          <span className="text-xs text-slate-500">Waiting…</span>
        )}
        <span className="ml-auto text-xs text-slate-600">{lines.length} lines</span>
      </div>
      <pre className="p-3 text-xs font-mono text-slate-300 overflow-y-auto flex-1 min-h-0">
        {lines.length === 0 && !isStreaming
          ? <span className="text-slate-600">No output yet…</span>
          : lines.map((line, i) => <div key={i} className="leading-5">{line || '\u00A0'}</div>)
        }
        <div ref={bottomRef} />
      </pre>
    </div>
  )
}

// ── Import dialog ──────────────────────────────────────────────────────────
function ImportDialog({ onClose }: { onClose: () => void }) {
  const { importJob, setImportJob, lines, isStreaming, streamError, barColor, handleStartImport, handleCancelImport } = useImport()

  const [name, setName] = useState('')
  const [family, setFamily] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nameError = name !== '' && !/^[a-z]([-a-z0-9]*[a-z0-9])?$/.test(name)
  const inProgress = importJob && (importJob.phase === 'uploading' || importJob.phase === 'importing')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-100">Import Image</h2>
          <button onClick={() => { if (importJob && !inProgress) setImportJob(null); onClose() }} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Form — only when no active import */}
          {!importJob && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Image name <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. fortigate-v7-6-0"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
                {nameError && <p className="text-red-400 text-xs mt-1">Must start with a letter, lowercase letters, digits and hyphens only</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Family <span className="text-slate-500">(optional)</span></label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. fortigate"
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Description <span className="text-slate-500">(optional)</span></label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Disk image file <span className="text-red-400">*</span>
                </label>
                <div
                  className="border border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-slate-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gz,.tar.gz,application/gzip"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <div className="space-y-1">
                      <p className="text-sm text-slate-200 font-mono">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024 / 1024 / 1024).toFixed(2)} GB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 text-slate-500 mx-auto" />
                      <p className="text-xs text-slate-400">Click to select a <span className="font-mono">.tar.gz</span> disk image</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Upload progress */}
          {importJob?.phase === 'uploading' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">Uploading <span className="font-mono">{importJob.imageName}</span> to GCS…</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{importJob.uploadProgress}%</span>
                  <span>{importJob.uploadProgress < 100 ? 'Uploading…' : 'Upload complete'}</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${importJob.uploadProgress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Importing / done / failed */}
          {importJob && importJob.phase !== 'uploading' && (
            <LogDisplay lines={lines} isStreaming={isStreaming} error={streamError} />
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
          {!importJob && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm">
                Cancel
              </button>
              <button
                onClick={() => file && name && !nameError && handleStartImport(name, family, description, file)}
                disabled={!file || !name || nameError}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
            </>
          )}
          {inProgress && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm">
                Close (continue in background)
              </button>
              <button
                onClick={() => { handleCancelImport(); onClose() }}
                className="px-4 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 text-sm"
              >
                Cancel import
              </button>
            </>
          )}
          {importJob && !inProgress && (
            <button onClick={() => { setImportJob(null); onClose() }} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Images page ────────────────────────────────────────────────────────────
export default function Images() {
  const { data: images, isLoading, isFetching, refetch } = useImages()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { importJob, setImportJob, lines, isStreaming, streamError, barColor, handleCancelImport } = useImport()
  const deleteImage = useDeleteImage()

  const jobActive = importJob && (importJob.phase === 'uploading' || importJob.phase === 'importing')
  const showBanner = !!importJob && !dialogOpen

  // Refetch when import completes successfully
  const prevPhase = useRef(importJob?.phase)
  useEffect(() => {
    if (prevPhase.current === 'importing' && importJob?.phase === 'done') refetch()
    prevPhase.current = importJob?.phase
  }, [importJob?.phase])

  async function handleDelete(name: string) {
    if (!window.confirm(`Delete image '${name}'? This cannot be undone.`)) return
    try {
      await deleteImage.mutateAsync(name)
      toast.success(`Image '${name}' deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete image')
    }
  }

  return (
    <div className="space-y-6">
      {dialogOpen && <ImportDialog onClose={() => setDialogOpen(false)} />}

      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Images</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Available images in the current project</p>
          <DocLink path="screens/images/" />
        </div>
      </div>

      {/* Inline import status banner */}
      {showBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-sm">
          {jobActive ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          ) : importJob.phase === 'done' ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}

          <span className="text-slate-300 truncate">
            {importJob.phase === 'uploading' && `Uploading '${importJob.imageName}'…`}
            {importJob.phase === 'importing' && `Importing '${importJob.imageName}'…`}
            {importJob.phase === 'done' && `Image '${importJob.imageName}' imported successfully.`}
            {importJob.phase === 'failed' && `Import of '${importJob.imageName}' failed.`}
          </span>

          {importJob.phase === 'uploading' && (
            <>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-16">
                <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${importJob.uploadProgress}%` }} />
              </div>
              <span className="text-xs text-slate-400 shrink-0">{importJob.uploadProgress}%</span>
            </>
          )}

          <button onClick={() => setDialogOpen(true)} className="text-xs text-blue-400 hover:text-blue-300 shrink-0 ml-auto">
            {importJob.phase === 'done' || importJob.phase === 'failed' ? 'View log' : 'View'}
          </button>

          {jobActive && (
            <button onClick={handleCancelImport} className="text-xs text-red-400 hover:text-red-300 shrink-0">
              Cancel
            </button>
          )}
          {!jobActive && (
            <button onClick={() => setImportJob(null)} className="text-slate-500 hover:text-slate-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">Images</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDialogOpen(true)}
              disabled={!!jobActive}
              title={jobActive ? 'Import already in progress' : undefined}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Image
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Name</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Family</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Status</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Size (GB)</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Created</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Description</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></td></tr>
                ) : !images?.length ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No images found</td></tr>
                ) : (
                  images.map((image) => (
                    <tr key={image.name} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <NameCell name={image.name} />
                      <FamilyCell name={image.name} family={image.family ?? ''} />
                      <td className={`px-3 py-2.5 ${image.status === 'READY' ? 'text-green-400' : 'text-slate-400'}`}>{image.status}</td>
                      <td className="px-3 py-2.5 text-slate-400">{image.disk_size_gb ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-400">{formatDate(image.creation_timestamp)}</td>
                      <DescriptionCell name={image.name} description={image.description ?? ''} />
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleDelete(image.name)}
                          disabled={deleteImage.isPending}
                          className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-50"
                          title="Delete image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && images && (
            <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-500 flex items-center gap-2">
              <RefreshCw className="w-3 h-3" />
              {images.length} images
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
