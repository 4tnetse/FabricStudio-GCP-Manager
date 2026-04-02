import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Loader2, Play, Trash2, ChevronRight, Eye, Calendar } from 'lucide-react'
import { DocLink } from '@/components/DocLink'
import {
  useSchedules,
  useDeleteSchedule,
  useUpdateSchedule,
  useTriggerSchedule,
  useJobRuns,
  useActiveJobRun,
  type Schedule,
  type JobRun,
} from '@/api/schedules'
import { useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/api/settings'
import { cn } from '@/lib/utils'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-900/40 text-blue-300',
    completed: 'bg-[rgb(74,222,128)] text-black',
    failed: 'bg-red-900/40 text-red-300',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[status] ?? 'bg-slate-800 text-slate-400')}>
      {status}
    </span>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const TZ_OPTIONS = [
  'Europe/Brussels', 'Europe/London', 'Europe/Paris', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'UTC',
]

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function datetimeToCron(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${minute} ${hour} ${day} ${month} *`
}

function cronToDateParts(cron: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, day, month] = parts.map(Number)
  if ([min, hour, day, month].some(isNaN)) return null
  return { year: new Date().getFullYear(), month, day, hour, minute: min }
}

function formatPreview(year: number, month: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${MONTHS[month - 1]} ${day}, ${year} at ${pad(hour)}:${pad(minute)}`
}

interface DateTimePickerProps {
  year: number; month: number; day: number; hour: number; minute: number
  onChange: (year: number, month: number, day: number, hour: number, minute: number) => void
  selectClass: string
}

function DateTimePicker({ year, month, day, hour, minute, onChange, selectClass }: DateTimePickerProps) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear + i)
  const maxDay = daysInMonth(month, year)
  const clampedDay = Math.min(day, maxDay)

  function set(field: 'year' | 'month' | 'day' | 'hour' | 'minute', val: number) {
    const next = { year, month, day: clampedDay, hour, minute, [field]: val }
    const md = daysInMonth(next.month, next.year)
    onChange(next.year, next.month, Math.min(next.day, md), next.hour, next.minute)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className={selectClass} value={month} onChange={(e) => set('month', +e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className={selectClass} value={clampedDay} onChange={(e) => set('day', +e.target.value)}>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className={selectClass} value={year} onChange={(e) => set('year', +e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="flex gap-2 items-center">
        <select className={selectClass} value={hour} onChange={(e) => set('hour', +e.target.value)}>
          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
          ))}
        </select>
        <span className="text-slate-400 text-sm font-medium">:</span>
        <select className={selectClass} value={minute} onChange={(e) => set('minute', +e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function formatCron(expr: string, timezone: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return `${expr} (${timezone})`
  const [min, hour, day, month, dow] = parts
  if (min !== '*' && hour !== '*' && day !== '*' && month !== '*' && dow === '*') {
    const m = parseInt(month)
    const monthLabel = MONTHS[(m - 1)] ?? month
    return `${monthLabel} ${day} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} (${timezone})`
  }
  return `${expr} (${timezone})`
}

function formatTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function PayloadPreview({ jobType, payload }: { jobType: string; payload: Record<string, unknown> }) {
  type Row = { label: string; value: string }
  const rows: Row[] = []

  function add(label: string, value: unknown, opts?: { mask?: boolean; skip_if_false?: boolean }) {
    if (value === undefined || value === null || value === '') return
    if (opts?.skip_if_false && value === false) return
    if (Array.isArray(value) && value.length === 0) return
    let str: string
    if (opts?.mask) {
      str = '••••••••'
    } else if (Array.isArray(value)) {
      str = value.join(', ')
    } else if (typeof value === 'boolean') {
      str = value ? 'Yes' : 'No'
    } else {
      str = String(value)
    }
    rows.push({ label, value: str })
  }

  if (jobType === 'clone') {
    add('Source instance', payload.source_name)
    add('Source zone', payload.zone)
    add('Destination zone', payload.target_zone)
    add('Workshop name', payload.clone_base_name)
    add('Purpose', payload.purpose)
    add('From', payload.count_start)
    add('To', payload.count_end)
    add('Delete existing', payload.overwrite, { skip_if_false: true })
  } else if (jobType === 'configure') {
    const instances = payload.instances as { name: string }[] | undefined
    if (instances?.length) add('Instances', instances.map(i => i.name))
    add('Admin password', payload.old_admin_password, { mask: true })
    add('New admin password', payload.admin_password, { mask: true })
    add('Guest password', payload.guest_password, { mask: true })
    add('Registration token', payload.trial_key ? '(set)' : undefined)
    add('License server', payload.license_server)
    add('Hostname template', payload.hostname_template)
    add('Delete all workspaces', payload.delete_all_workspaces, { skip_if_false: true })
    const fabrics = payload.workspace_fabrics as { name: string; template_name?: string }[] | undefined
    if (fabrics?.length) add('Workspace fabrics', fabrics.map(f => f.name))
    const keys = payload.ssh_keys as string[] | undefined
    if (keys?.length) add('SSH keys', `${keys.length} key${keys.length !== 1 ? 's' : ''}`)
    add('Delete existing keys', payload.delete_existing_keys, { skip_if_false: true })
  } else if (jobType === 'ssh') {
    const addresses = payload.addresses as string[] | undefined
    if (addresses?.length) add('Hosts', `${addresses.length} host${addresses.length !== 1 ? 's' : ''}: ${addresses.join(', ')}`)
    add('Config file', payload.config_name)
    const commands = payload.commands as string[] | undefined
    if (commands?.length) add('Commands', commands.join('\n'))
    add('Mode', payload.parallel === false ? 'Sequential' : payload.parallel === true ? 'Parallel' : undefined)
  } else if (jobType === 'delete') {
    const instances = payload.instances as { name: string; zone: string }[] | undefined
    if (instances?.length) add('Instances', instances.map(i => i.name))
  }

  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No parameters.</p>
  }

  return (
    <div className="space-y-1.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="grid gap-x-3 text-xs" style={{ gridTemplateColumns: '10rem 1fr' }}>
          <span className="text-slate-500 shrink-0">{label}</span>
          <span className="text-slate-300 break-all whitespace-pre-wrap font-mono">{value}</span>
        </div>
      ))}
    </div>
  )
}

function RunLogsPanel({ run }: { run: JobRun }) {
  const isRunning = run.status === 'running'
  const { data: liveRun } = useActiveJobRun(run.id, isRunning)
  const displayRun = liveRun ?? run
  const lines = displayRun.log_lines
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRunning && lines.length > 0) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [lines.length, isRunning])

  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-medium text-slate-400">Log output</p>
        {isRunning && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
      </div>
      <div ref={scrollRef} className="font-mono text-xs text-slate-300 space-y-0.5 max-h-64 overflow-y-auto">
        {lines.length === 0 && <span className="text-slate-500">No log lines recorded.</span>}
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
      </div>
      {displayRun.error_summary && (
        <div className="mt-2 text-xs text-red-400 border-t border-slate-800 pt-2">{displayRun.error_summary}</div>
      )}
    </div>
  )
}

function RunsPanel({ schedule }: { schedule: Schedule }) {
  const { data: runs = [], isLoading } = useJobRuns(schedule.id)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const autoExpandedRef = useRef<string | null>(null)

  // Auto-expand newly detected running run
  const runningRun = runs.find((r) => r.status === 'running')
  useEffect(() => {
    if (runningRun && autoExpandedRef.current !== runningRun.id) {
      autoExpandedRef.current = runningRun.id
      setExpandedRun(runningRun.id)
    }
  }, [runningRun?.id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4 text-center">No runs yet for this schedule.</p>
    )
  }

  return (
    <div className="space-y-1">
      {runs.map((run) => (
        <div key={run.id} className="rounded-lg bg-slate-800/40 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
          >
            <StatusBadge status={run.status} />
            <span className="text-xs text-slate-400 w-36 shrink-0">{formatTs(run.started_at)}</span>
            <span className="text-xs text-slate-500 w-16 shrink-0">{formatDuration(run.started_at, run.finished_at)}</span>
            <span className="text-xs text-slate-500">{run.triggered_by}</span>
            <ChevronRight className={cn('w-3.5 h-3.5 text-slate-600 ml-auto transition-transform', expandedRun === run.id && 'rotate-90')} />
          </button>
          {expandedRun === run.id && (
            <div className="px-4 pb-4">
              <RunLogsPanel run={run} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ScheduleRow({ schedule, selected, onSelect }: {
  schedule: Schedule
  selected: boolean
  onSelect: () => void
}) {
  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'
  const { data: runs = [] } = useJobRuns(schedule.id)
  const latestRun = runs[0] ?? null
  const deleteSchedule = useDeleteSchedule()
  const updateSchedule = useUpdateSchedule()
  const triggerSchedule = useTriggerSchedule()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)

  // Reschedule state — pre-filled from current cron
  const existingParts = cronToDateParts(schedule.cron_expression)
  const now = new Date()
  const [rsYear, setRsYear] = useState(existingParts?.year ?? now.getFullYear())
  const [rsMonth, setRsMonth] = useState(existingParts?.month ?? now.getMonth() + 1)
  const [rsDay, setRsDay] = useState(existingParts?.day ?? now.getDate())
  const [rsHour, setRsHour] = useState(existingParts?.hour ?? 8)
  const [rsMinute, setRsMinute] = useState(existingParts?.minute ?? 0)
  const [rsTz, setRsTz] = useState(schedule.timezone || 'UTC')

  async function handleDelete() {
    try {
      await deleteSchedule.mutateAsync(schedule.id)
      toast.success('Schedule deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete schedule')
    }
  }

  async function handleReschedule() {
    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        body: {
          cron_expression: datetimeToCron(rsYear, rsMonth, rsDay, rsHour, rsMinute),
          timezone: rsTz,
        },
      })
      toast.success('Schedule updated')
      setShowReschedule(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reschedule')
    }
  }

  const selectClass = isSF
    ? 'flex-1 px-2 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#db291c]'
    : 'flex-1 px-2 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div
      className={cn(
        'rounded-lg p-4 cursor-pointer',
        selected ? (isSF ? 'bg-[#db291c]/10' : 'bg-blue-900/20') : 'bg-slate-800/30',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-200 truncate">{schedule.name}</span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 capitalize shrink-0">
              {schedule.job_type === 'ssh' ? 'SSH' : schedule.job_type}
            </span>
            {latestRun && (
              latestRun.status === 'completed'
                ? <span className="px-1.5 py-0.5 rounded text-xs bg-[rgb(74,222,128)] text-black shrink-0">last run: ok</span>
                : latestRun.status === 'failed'
                ? <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/40 text-red-400 shrink-0">last run: error</span>
                : latestRun.status === 'running'
                ? <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 shrink-0">running</span>
                : null
            )}
          </div>
          <div className="text-xs text-slate-500">{formatCron(schedule.cron_expression, schedule.timezone)}</div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={async () => {
              try {
                await triggerSchedule.mutateAsync(schedule.id)
                toast.success('Job started')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to trigger job')
              }
            }}
            disabled={triggerSchedule.isPending}
            title="Run now"
            className="p-1.5 rounded text-slate-400 hover:text-blue-300 hover:bg-slate-700 transition-colors"
          >
            {triggerSchedule.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            title="Preview"
            className={`p-1.5 rounded transition-colors ${showPreview ? (isSF ? 'text-[#db291c] bg-slate-700' : 'text-blue-300 bg-slate-700') : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowReschedule(true)}
            title="Reschedule"
            className="p-1.5 rounded text-slate-400 hover:text-blue-300 hover:bg-slate-700 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete schedule"
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">{schedule.name}</h2>
              <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400 capitalize">{schedule.job_type === 'ssh' ? 'SSH' : schedule.job_type}</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex gap-2">
                <span className="text-slate-500 w-24 shrink-0">Schedule</span>
                <span className="text-slate-300">{formatCron(schedule.cron_expression, schedule.timezone)}</span>
              </div>
              {schedule.created_by && (
                <div className="flex gap-2">
                  <span className="text-slate-500 w-24 shrink-0">Created by</span>
                  <span className="text-slate-300">{schedule.created_by}</span>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3">
              <p className="text-xs font-medium text-slate-400 mb-2">Job parameters</p>
              <PayloadPreview jobType={schedule.job_type} payload={schedule.payload} />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowReschedule(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-100">Reschedule — {schedule.name}</h2>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Run at</p>
              <DateTimePicker
                year={rsYear} month={rsMonth} day={rsDay} hour={rsHour} minute={rsMinute}
                onChange={(y, mo, d, h, mi) => { setRsYear(y); setRsMonth(mo); setRsDay(d); setRsHour(h); setRsMinute(mi) }}
                selectClass={selectClass}
              />
              <p className={`text-xs mt-1.5 ${isSF ? 'text-[#db291c]' : 'text-blue-400'}`}>
                {formatPreview(rsYear, rsMonth, rsDay, rsHour, rsMinute)} ({rsTz})
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Timezone</p>
              <select
                className={`w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 ${isSF ? 'focus:ring-[#db291c]' : 'focus:ring-blue-500'}`}
                value={rsTz}
                onChange={(e) => setRsTz(e.target.value)}
              >
                {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReschedule(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={updateSchedule.isPending}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg disabled:opacity-50 text-white text-sm font-medium transition-colors ${isSF ? 'bg-[#db291c] hover:bg-[#c0221a]' : 'bg-blue-600 hover:bg-blue-500'}`}
              >
                {updateSchedule.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-100 mb-2">Delete schedule</h2>
            <p className="text-sm text-slate-400 mb-4">Delete <span className="text-slate-200 font-medium">"{schedule.name}"</span>? This will also remove the Cloud Scheduler job.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDelete(false); handleDelete() }}
                disabled={deleteSchedule.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white"
              >
                {deleteSchedule.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function cronToTimestamp(expr: string): number {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 0
  const [min, hour, day, month] = parts.map(Number)
  if ([min, hour, day, month].some(isNaN)) return 0
  return new Date(new Date().getFullYear(), month - 1, day, hour, min).getTime()
}

export default function Schedules() {
  const { data: settings } = useSettings()
  const projectId = settings?.active_project_id ?? null
  const { data: schedules = [], isLoading } = useSchedules(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedId(null)
  }, [projectId])

  const sortedSchedules = [...schedules].sort(
    (a, b) => cronToTimestamp(b.cron_expression) - cronToTimestamp(a.cron_expression)
  )
  const selectedSchedule = sortedSchedules.find((s) => s.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Schedules</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Scheduled Clone and Configure jobs</p>
          <DocLink path="screens/schedules/" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Schedule list */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">Schedules</h2>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}

          {!isLoading && schedules.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-slate-500">No schedules yet.</p>
              <p className="text-xs text-slate-600">Use the Schedule button on the Clone or Configure screens to create one.</p>
            </div>
          )}

          {sortedSchedules.map((s) => (
            <ScheduleRow
              key={s.id}
              schedule={s}
              selected={s.id === selectedId}
              onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)}
            />
          ))}
        </div>

        {/* Run history */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">
            {selectedSchedule ? `Run history — ${selectedSchedule.name}` : 'Run history'}
          </h2>

          {!selectedSchedule && (
            <p className="text-sm text-slate-500 text-center py-8">Select a schedule to view its run history.</p>
          )}

          {selectedSchedule && (
            <RunsPanel schedule={selectedSchedule} />
          )}
        </div>

      </div>
    </div>
  )
}
