import { useState } from 'react'
import { toast } from 'sonner'
import { useImages, useUpdateImageDescription } from '@/api/images'
import { Loader2, RefreshCw, HardDrive, Pencil, Check, X } from 'lucide-react'

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
      <div className="flex items-center gap-1.5 group">
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

export default function Images() {
  const { data: images, isLoading, isFetching, refetch } = useImages()

  return (
    <div className="space-y-6">
      <div className="page-title-row flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Images</h1>
          <p className="text-sm text-slate-400 mt-0.5">Available images in the current project</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">Images</h2>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
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
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : !images?.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No images found
                    </td>
                  </tr>
                ) : (
                  images.map((image) => (
                    <tr key={image.name} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 font-mono text-slate-200">{image.name}</td>
                      <td className="px-3 py-2.5 text-slate-400">{image.family ?? '—'}</td>
                      <td className={`px-3 py-2.5 ${image.status === 'READY' ? 'text-green-400' : 'text-slate-400'}`}>
                        {image.status}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{image.disk_size_gb ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-400">{formatDate(image.creation_timestamp)}</td>
                      <DescriptionCell name={image.name} description={image.description ?? ''} />
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
