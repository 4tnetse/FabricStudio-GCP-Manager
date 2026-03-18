import type { ElementType } from 'react'
import { useInstances } from '@/api/instances'
import { useSettings } from '@/api/settings'
import { InstanceTable } from '@/components/InstanceTable'
import { Server, Play, Square, Loader2 } from 'lucide-react'

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  loading,
}: {
  label: string
  value: number
  icon: ElementType
  colorClass: string
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : (
          <div className="text-2xl font-semibold text-slate-100">{value}</div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: instances = [], isLoading } = useInstances()
  const { data: settings } = useSettings()

  const running = instances.filter((i) => i.status === 'RUNNING').length
  const stopped = instances.filter((i) => i.status === 'TERMINATED').length

  return (
    <div className="flex flex-col h-full gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Instances</h1>
        <p className="text-sm text-slate-400 mt-0.5">Overview of all instances in your project</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        <StatCard
          label="Total Instances"
          value={instances.length}
          icon={Server}
          colorClass="bg-slate-700 text-slate-300"
          loading={isLoading}
        />
        <StatCard
          label="Running"
          value={running}
          icon={Play}
          colorClass="bg-green-900/60 text-green-400"
          loading={isLoading}
        />
        <StatCard
          label="Stopped"
          value={stopped}
          icon={Square}
          colorClass="bg-slate-700 text-slate-400"
          loading={isLoading}
        />
      </div>

      <div className="flex-1 min-h-0">
        <InstanceTable />
      </div>
    </div>
  )
}
