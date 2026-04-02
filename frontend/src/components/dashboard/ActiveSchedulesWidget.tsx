import { CalendarClock, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettings } from '@/api/settings'
import { useSchedules } from '@/api/schedules'
import { cn } from '@/lib/utils'

const MAX_SHOWN = 5
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function jobTypeBadge(type: string) {
  if (type === 'clone') return 'bg-blue-600 text-white'
  if (type === 'configure') return 'bg-purple-600 text-white'
  if (type === 'ssh') return 'bg-teal-600 text-white'
  return 'bg-slate-600 text-white'
}

function formatCron(expr: string, timezone: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, day, month, dow] = parts
  if (min !== '*' && hour !== '*' && day !== '*' && month !== '*' && dow === '*') {
    const monthLabel = MONTHS[(parseInt(month) - 1)] ?? month
    return `${monthLabel} ${day} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} (${timezone})`
  }
  return `${expr} (${timezone})`
}

export function ActiveSchedulesWidget() {
  const { data: settings } = useSettings()
  const projectId = settings?.active_project_id

  const { data: schedules = [], isLoading } = useSchedules(projectId)

  const sorted = [...schedules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const visible = sorted.slice(0, MAX_SHOWN)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Schedules</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : schedules.length === 0 ? (
        <div className="space-y-1">
          <div className="text-sm text-slate-500">No schedules configured</div>
          <Link to="/schedules" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Set up schedules →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((schedule) => (
            <div key={schedule.id} className="flex items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium shrink-0', jobTypeBadge(schedule.job_type))}>
                {schedule.job_type}
              </span>
              <span className="text-xs text-slate-200 flex-1 truncate">{schedule.name}</span>
              <span className="text-xs text-slate-500 shrink-0">{formatCron(schedule.cron_expression, schedule.timezone)}</span>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', schedule.enabled ? 'bg-green-500' : 'bg-slate-600')} />
            </div>
          ))}
        </div>
      )}

      <Link to="/schedules" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View all schedules →
      </Link>
    </div>
  )
}
