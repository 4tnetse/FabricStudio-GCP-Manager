import { useState } from 'react'
import { X, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateSchedule, type ScheduleCreate } from '@/api/schedules'

interface Props {
  jobType: 'clone' | 'configure'
  payload: Record<string, unknown>
  projectId?: string
  onClose: () => void
}

function defaultDatetime(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  // Format as "YYYY-MM-DDTHH:mm" for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeToCron(dt: string): string {
  // dt is "YYYY-MM-DDTHH:mm" — interpret as-is in the chosen timezone
  const [, timePart] = dt.split('T')
  const datePart = dt.split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  void year
  return `${minute} ${hour} ${day} ${month} *`
}

function formatPreview(dt: string): string {
  if (!dt) return ''
  const [datePart, timePart] = dt.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}, ${year} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const TZ_OPTIONS = [
  'Europe/Brussels',
  'Europe/London',
  'Europe/Paris',
  'Europe/Amsterdam',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
]

export function ScheduleDialog({ jobType, payload, projectId, onClose }: Props) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const defaultTz = TZ_OPTIONS.includes(browserTz) ? browserTz : 'UTC'

  const [name, setName] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultDatetime)
  const [timezone, setTimezone] = useState(defaultTz)

  const createSchedule = useCreateSchedule()

  const isValid = !!name.trim() && !!scheduledAt

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const body: ScheduleCreate = {
      name: name.trim(),
      job_type: jobType,
      cron_expression: datetimeToCron(scheduledAt),
      timezone,
      enabled: true,
      payload,
      project_id: projectId,
    }
    try {
      await createSchedule.mutateAsync(body)
      toast.success('Schedule saved')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule')
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Schedule {jobType === 'clone' ? 'Clone' : 'Configure'} job
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            placeholder="e.g. Nightly workshop clone"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Date/time */}
        <div>
          <label className={labelClass}>Run at</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          {scheduledAt && (
            <p className="text-xs text-blue-400 mt-1.5">{formatPreview(scheduledAt)} ({timezone})</p>
          )}
        </div>

        {/* Timezone */}
        <div>
          <label className={labelClass}>Timezone</label>
          <select
            className={inputClass}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {TZ_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* Job summary */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-xs font-medium text-slate-400 mb-1.5">Job parameters</p>
          <pre className="text-xs text-slate-400 whitespace-pre-wrap break-all font-mono leading-relaxed max-h-32 overflow-y-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={createSchedule.isPending || !isValid}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {createSchedule.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  )
}
