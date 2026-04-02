import { Server, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInstances } from '@/api/instances'

export function InstanceSummaryWidget() {
  const { data: instances = [], isLoading } = useInstances()

  const running = instances.filter((i) => i.status === 'RUNNING').length
  const stopped = instances.filter((i) => i.status === 'TERMINATED').length
  const other = instances.length - running - stopped

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Instance Summary</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 text-center">
            <div className="text-xl font-semibold text-slate-100">{instances.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">Total</div>
          </div>
          <div className="rounded-lg bg-green-900/20 px-3 py-2.5 text-center">
            <div className="text-xl font-semibold text-green-400">{running}</div>
            <div className="text-xs text-green-500/70 mt-0.5">Running</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 text-center">
            <div className="text-xl font-semibold text-slate-400">{stopped}</div>
            <div className="text-xs text-slate-500 mt-0.5">Stopped</div>
          </div>
          {other > 0 && (
            <div className="col-span-3 rounded-lg bg-yellow-500 px-3 py-2 text-center">
              <div className="text-sm font-semibold text-white">{other} transitioning</div>
            </div>
          )}
        </div>
      )}

      <Link to="/" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View all instances →
      </Link>
    </div>
  )
}
