import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateSchedule, type ScheduleCreate } from '@/api/schedules'
import { useTheme } from '@/context/ThemeContext'

interface Props {
  jobType: 'clone' | 'configure' | 'ssh' | 'delete'
  payload: Record<string, unknown>
  projectId?: string
  onClose: () => void
}

export const SCHEDULE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MONTHS = SCHEDULE_MONTHS

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

export function scheduleDefaultParts() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() }
}

function defaultParts() { return scheduleDefaultParts() }

function partsToDt(year: number, month: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

export function scheduleDatetimeToCron(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${minute} ${hour} ${day} ${month} *`
}

function datetimeToCron(dt: string): string {
  const [datePart, timePart] = dt.split('T')
  const [, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  return `${minute} ${hour} ${day} ${month} *`
}

export function scheduleFormatPreview(year: number, month: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${SCHEDULE_MONTHS[month - 1]} ${day}, ${year} at ${pad(hour)}:${pad(minute)}`
}

function formatPreview(year: number, month: number, day: number, hour: number, minute: number): string {
  return scheduleFormatPreview(year, month, day, hour, minute)
}

export const SCHEDULE_TZ_OPTIONS = [
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

const TZ_OPTIONS = SCHEDULE_TZ_OPTIONS

export interface DateTimePickerProps {
  year: number; month: number; day: number; hour: number; minute: number
  onChange: (year: number, month: number, day: number, hour: number, minute: number) => void
  selectClass: string
}

export function DateTimePicker({ year, month, day, hour, minute, onChange, selectClass }: DateTimePickerProps) {
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

export function ScheduleDialog({ jobType, payload, projectId, onClose }: Props) {
  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const defaultTz = TZ_OPTIONS.includes(browserTz) ? browserTz : 'UTC'

  const [name, setName] = useState('')
  const init = defaultParts()
  const [year, setYear] = useState(init.year)
  const [month, setMonth] = useState(init.month)
  const [day, setDay] = useState(init.day)
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(0)
  const [timezone, setTimezone] = useState(defaultTz)

  const createSchedule = useCreateSchedule()
  const isValid = !!name.trim()

  function handleDateTimeChange(y: number, mo: number, d: number, h: number, mi: number) {
    setYear(y); setMonth(mo); setDay(d); setHour(h); setMinute(mi)
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const dt = partsToDt(year, month, day, hour, minute)
    const body: ScheduleCreate = {
      name: name.trim(),
      job_type: jobType,
      cron_expression: datetimeToCron(dt),
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

  const inputClass = isSF
    ? 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#db291c] placeholder:text-slate-500'
    : 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const selectClass = isSF
    ? 'flex-1 px-2 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#db291c]'
    : 'flex-1 px-2 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return createPortal(
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
              Schedule {jobType === 'clone' ? 'Clone' : jobType === 'configure' ? 'Configure' : jobType === 'ssh' ? 'SSH' : 'Delete'} job
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
          <DateTimePicker
            year={year} month={month} day={day} hour={hour} minute={minute}
            onChange={handleDateTimeChange}
            selectClass={selectClass}
          />
          <p className={`text-xs mt-1.5 ${isSF ? 'text-[#db291c]' : 'text-blue-400'}`}>
            {formatPreview(year, month, day, hour, minute)} ({timezone})
          </p>
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg disabled:opacity-50 text-white text-sm font-medium transition-colors ${isSF ? 'bg-[#db291c] hover:bg-[#c0221a]' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {createSchedule.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Schedule
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
