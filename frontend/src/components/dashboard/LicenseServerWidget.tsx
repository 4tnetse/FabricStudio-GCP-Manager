import { Key, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInstances } from '@/api/instances'
import { cn } from '@/lib/utils'

export function LicenseServerWidget() {
  const { data: instances = [], isLoading } = useInstances()

  const licenseServer = instances.find(
    (i) => i.labels?.purpose?.toLowerCase() === 'licenseserver'
  )

  function statusBadgeClass(status: string) {
    if (status === 'RUNNING') return 'bg-green-600 text-white'
    if (status === 'TERMINATED' || status === 'STOPPED') return 'bg-red-600 text-white'
    if (status === 'STOPPING' || status === 'SUSPENDING' || status === 'SUSPENDED') return 'bg-orange-600 text-white'
    return 'bg-yellow-600 text-white'
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">License Server</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : licenseServer ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-100 truncate">{licenseServer.name}</span>
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium shrink-0', statusBadgeClass(licenseServer.status))}>
              {licenseServer.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-slate-500">IP: </span>
              <span className="text-slate-300 font-mono">{licenseServer.internal_ip ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">Type: </span>
              <span className="text-slate-300">{licenseServer.machine_type}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-sm text-slate-400">No license server found</div>
          <div className="text-xs text-slate-500">Use Configure to set purpose=licenseserver on an instance.</div>
        </div>
      )}

      <Link to="/configure" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Go to Configure →
      </Link>
    </div>
  )
}
