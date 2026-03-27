import { useState } from 'react'
import { X, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateSchedule, type ScheduleCreate } from '@/api/schedules'

interface Props {
  jobType: 'clone' | 'configure'
  payload: Record<string, unknown>
  onClose: () => void
}

// Simple human-readable cron preview without an external library
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid cron expression'
  const [min, hour, dom, month, dow] = parts

  const days: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' }
  const months: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' }

  if (expr === '* * * * *') return 'Every minute'
  if (min !== '*' && hour !== '*' && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  if (min !== '*' && hour !== '*' && dom === '*' && month === '*' && dow !== '*') {
    const dowLabel = dow.split(',').map((d) => days[d] ?? d).join(', ')
    return `Every ${dowLabel} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  if (min !== '*' && hour !== '*' && dom !== '*' && month === '*' && dow === '*') {
    return `Monthly on day ${dom} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  if (min !== '*' && hour !== '*' && dom !== '*' && month !== '*' && dow === '*') {
    const monthLabel = months[month] ?? month
    return `Yearly on ${monthLabel} ${dom} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  return `Cron: ${expr}`
}

const CRON_PRESETS = [
  { label: 'Every weekday at 20:00', value: '0 20 * * 1-5' },
  { label: 'Every day at 08:00', value: '0 8 * * *' },
  { label: 'Every Monday at 07:00', value: '0 7 * * 1' },
  { label: 'Every Sunday at 02:00', value: '0 2 * * 0' },
]

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

export function ScheduleDialog({ jobType, payload, onClose }: Props) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const defaultTz = TZ_OPTIONS.includes(browserTz) ? browserTz : 'UTC'

  const [name, setName] = useState('')
  const [cron, setCron] = useState('0 20 * * 1-5')
  const [timezone, setTimezone] = useState(defaultTz)
  const [enabled, setEnabled] = useState(true)

  const createSchedule = useCreateSchedule()

  const cronPreview = describeCron(cron)
  const cronInvalid = cron.trim().split(/\s+/).length !== 5

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (cronInvalid) {
      toast.error('Invalid cron expression (need 5 parts: min hour dom month dow)')
      return
    }
    const body: ScheduleCreate = {
      name: name.trim(),
      job_type: jobType,
      cron_expression: cron.trim(),
      timezone,
      enabled,
      payload,
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

        {/* Cron */}
        <div>
          <label className={labelClass}>Cron expression</label>
          <div className="flex gap-2">
            <input
              className={cronInvalid && cron ? inputClass.replace('border-slate-700', 'border-red-500') : inputClass}
              placeholder="0 20 * * 1-5"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setCron(p.value)}
                className="px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          {!cronInvalid && (
            <p className="text-xs text-blue-400 mt-1.5">{cronPreview}</p>
          )}
          {cronInvalid && cron && (
            <p className="text-xs text-red-400 mt-1.5">Need 5 parts: minute hour day-of-month month day-of-week</p>
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

        {/* Enabled */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
            onClick={() => setEnabled(!enabled)}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-slate-300">Enable schedule immediately</span>
        </label>

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
            disabled={createSchedule.isPending || !name.trim() || cronInvalid}
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
