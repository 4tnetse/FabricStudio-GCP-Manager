import { Activity, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettings } from '@/api/settings'
import { useSchedules, useJobRuns } from '@/api/schedules'
import { cn } from '@/lib/utils'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function statusBadgeClass(status: string) {
  if (status === 'completed') return 'bg-green-600 text-white'
  if (status === 'failed') return 'bg-red-600 text-white'
  if (status === 'running') return 'bg-yellow-600 text-white'
  return 'bg-slate-600 text-white'
}

export function RecentActivityWidget() {
  const { data: settings } = useSettings()
  const projectId = settings?.active_project_id

  const { data: schedules = [], isLoading: schedulesLoading } = useSchedules(projectId)

  const recentSchedule = schedules
    .slice()
    .sort((a, b) => {
      const aTime = a.updated_at ?? a.created_at ?? ''
      const bTime = b.updated_at ?? b.created_at ?? ''
      return bTime.localeCompare(aTime)
    })[0] ?? null

  const { data: runs = [], isLoading: runsLoading } = useJobRuns(recentSchedule?.id ?? null)

  const isLoading = schedulesLoading || runsLoading
  const recent = runs.slice(0, 3)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Recent Activity</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : recent.length === 0 ? (
        <div className="text-sm text-slate-500">No recent activity</div>
      ) : (
        <div className="space-y-2">
          {recent.map((run) => (
            <div key={run.id} className="flex items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium shrink-0 flex items-center gap-1', statusBadgeClass(run.status))}>
                {run.status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {run.status}
              </span>
              <span className="text-xs text-slate-200 flex-1 truncate">{run.schedule_name}</span>
              <span className="text-xs text-slate-500 shrink-0">{timeAgo(run.finished_at ?? run.started_at)}</span>
            </div>
          ))}
        </div>
      )}

      <Link to="/schedules" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View schedules →
      </Link>
    </div>
  )
}
