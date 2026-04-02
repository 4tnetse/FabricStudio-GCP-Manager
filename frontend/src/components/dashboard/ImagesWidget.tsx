import { HardDrive, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useImages } from '@/api/images'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ImagesWidget() {
  const { data: images = [], isLoading } = useImages()

  const totalDiskGb = images.reduce((sum, img) => sum + (img.disk_size_gb ?? 0), 0)

  const sorted = [...images].sort((a, b) => {
    const aTime = a.creation_timestamp ?? ''
    const bTime = b.creation_timestamp ?? ''
    return bTime.localeCompare(aTime)
  })

  const recent = sorted.slice(0, 3)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Images</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total: </span>
              <span className="text-slate-200 font-medium">{images.length} images</span>
            </div>
            <div>
              <span className="text-slate-500">Size: </span>
              <span className="text-slate-200 font-medium">{totalDiskGb} GB</span>
            </div>
          </div>

          {recent.length > 0 && (
            <div className="space-y-1.5">
              {recent.map((img) => (
                <div key={img.name} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate flex-1">{img.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{formatDate(img.creation_timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Link to="/images" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View all images →
      </Link>
    </div>
  )
}
