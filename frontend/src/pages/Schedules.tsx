import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Loader2, Play, Trash2, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react'
import {
  useSchedules,
  useDeleteSchedule,
  useEnableSchedule,
  useDisableSchedule,
  useTriggerSchedule,
  useJobRuns,
  type Schedule,
  type JobRun,
} from '@/api/schedules'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-900/40 text-blue-300 border-blue-800',
    completed: 'bg-green-900/40 text-green-300 border-green-800',
    failed: 'bg-red-900/40 text-red-300 border-red-800',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs border font-medium', colors[status] ?? 'bg-slate-800 text-slate-400 border-slate-700')}>
      {status}
    </span>
  )
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

function RunLogsPanel({ run }: { run: JobRun }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-400 mb-2">Log output</p>
      <div className="font-mono text-xs text-slate-300 space-y-0.5 max-h-64 overflow-y-auto">
        {run.log_lines.length === 0 && <span className="text-slate-500">No log lines recorded.</span>}
        {run.log_lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
      </div>
      {run.error_summary && (
        <div className="mt-2 text-xs text-red-400 border-t border-slate-800 pt-2">{run.error_summary}</div>
      )}
    </div>
  )
}

function RunsPanel({ schedule }: { schedule: Schedule }) {
  const { data: runs = [], isLoading } = useJobRuns(schedule.id)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

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
        <div key={run.id} className="rounded-lg border border-slate-700 bg-slate-800/40 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/60 transition-colors"
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
  const deleteSchedule = useDeleteSchedule()
  const enableSchedule = useEnableSchedule()
  const disableSchedule = useDisableSchedule()
  const triggerSchedule = useTriggerSchedule()

  async function handleDelete() {
    if (!confirm(`Delete schedule "${schedule.name}"?`)) return
    try {
      await deleteSchedule.mutateAsync(schedule.id)
      toast.success('Schedule deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete schedule')
    }
  }

  async function handleToggle() {
    try {
      if (schedule.enabled) {
        await disableSchedule.mutateAsync(schedule.id)
        toast.success('Schedule disabled')
      } else {
        await enableSchedule.mutateAsync(schedule.id)
        toast.success('Schedule enabled')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update schedule')
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 cursor-pointer transition-colors',
        selected
          ? isSF ? 'border-[#db291c] bg-[#db291c]/10' : 'border-blue-600 bg-blue-900/20'
          : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/60',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-200 truncate">{schedule.name}</span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 capitalize shrink-0">
              {schedule.job_type}
            </span>
            {schedule.enabled ? (
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-900/40 text-green-400 border border-green-800 shrink-0">enabled</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-500 border border-slate-700 shrink-0">disabled</span>
            )}
          </div>
          <div className="text-xs text-slate-500 font-mono">{schedule.cron_expression} ({schedule.timezone})</div>
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
            onClick={handleToggle}
            title={schedule.enabled ? 'Disable' : 'Enable'}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            {schedule.enabled
              ? <ToggleRight className="w-4 h-4 text-green-400" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            title="Delete schedule"
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Schedules() {
  const { data: schedules = [], isLoading } = useSchedules()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedSchedule = schedules.find((s) => s.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Schedules</h1>
        <p className="text-sm text-slate-400 mt-0.5">Scheduled Clone and Configure jobs</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

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

          {schedules.map((s) => (
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
