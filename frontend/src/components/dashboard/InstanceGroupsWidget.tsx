import { Layers, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInstances } from '@/api/instances'
import { cn } from '@/lib/utils'

const MAX_GROUPS = 6

export function InstanceGroupsWidget() {
  const { data: instances = [], isLoading } = useInstances()

  const groupMap = new Map<string, { total: number; running: number }>()
  for (const inst of instances) {
    const key = inst.labels?.workshop ?? '—'
    const existing = groupMap.get(key) ?? { total: 0, running: 0 }
    groupMap.set(key, {
      total: existing.total + 1,
      running: existing.running + (inst.status === 'RUNNING' ? 1 : 0),
    })
  }

  const groups = Array.from(groupMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => {
      if (b.running !== a.running) return b.running - a.running
      return a.name.localeCompare(b.name)
    })

  const visible = groups.slice(0, MAX_GROUPS)
  const extra = groups.length - MAX_GROUPS

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Instance Groups</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-slate-500">No instances found</div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((group) => {
            const pct = group.total > 0 ? (group.running / group.total) * 100 : 0
            return (
              <div key={group.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-medium', group.name === '—' ? 'text-slate-500 italic' : 'text-slate-300')}>
                    {group.name}
                  </span>
                  <span className="text-xs text-slate-500">{group.running} / {group.total} running</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {extra > 0 && (
            <div className="text-xs text-slate-500">+{extra} more group{extra !== 1 ? 's' : ''}</div>
          )}
        </div>
      )}

      <Link to="/" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View all instances →
      </Link>
    </div>
  )
}
