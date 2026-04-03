import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Trash2,
  ArrowLeft,
  Plus,
  Copy,
  Download,
  Users,
  X,
} from 'lucide-react'
import { DocLink } from '@/components/DocLink'
import {
  useWorkshops,
  useWorkshop,
  useAttendees,
  useCreateWorkshop,
  useUpdateWorkshop,
  useDeleteWorkshop,
  useRemoveAttendee,
  useStartWorkshop,
  useStopWorkshop,
  type Workshop,
  type WorkshopCreate,
} from '@/api/workshops'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function slotCount(w: Workshop) {
  return w.count_end - w.count_start + 1
}

function slotName(w: Workshop, n: number) {
  return `${w.name}-${String(n).padStart(3, '0')}`
}

function toLocalDatetimeInput(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function fromLocalDatetimeInput(val: string): string | null {
  if (!val) return null
  return new Date(val).toISOString()
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Workshop['status'] }) {
  const map: Record<Workshop['status'], string> = {
    draft: 'bg-slate-700 text-slate-300',
    scheduled: 'bg-blue-900/60 text-blue-300',
    deploying: 'bg-amber-900/60 text-amber-300',
    running: 'bg-green-900/60 text-green-300',
    ended: 'bg-slate-700 text-slate-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? map.draft}`}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// New Workshop Modal
// ---------------------------------------------------------------------------

interface NewWorkshopModalProps {
  onClose: () => void
  onCreated: (id: string) => void
}

function NewWorkshopModal({ onClose, onCreated }: NewWorkshopModalProps) {
  const createWorkshop = useCreateWorkshop()

  const [name, setName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [guestPassword, setGuestPassword] = useState('')
  const [sourceImage, setSourceImage] = useState('')
  const [machineType, setMachineType] = useState('')
  const [zone, setZone] = useState('')
  const [countStart, setCountStart] = useState(1)
  const [countEnd, setCountEnd] = useState(1)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !passphrase || !guestPassword || !sourceImage || !machineType || !zone) {
      toast.error('Please fill in all required fields.')
      return
    }
    try {
      const data: WorkshopCreate = {
        name,
        passphrase,
        guest_password: guestPassword,
        source_image: sourceImage,
        machine_type: machineType,
        zone,
        count_start: countStart,
        count_end: countEnd,
      }
      const created = await createWorkshop.mutateAsync(data)
      toast.success('Workshop created.')
      onCreated(created.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create workshop.')
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-100">New Workshop</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelCls}>Workshop name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. workshop-2026-04" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Admin passphrase *</label>
              <input className={inputCls} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="admin passphrase" />
            </div>
            <div>
              <label className={labelCls}>Guest password *</label>
              <input className={inputCls} value={guestPassword} onChange={(e) => setGuestPassword(e.target.value)} placeholder="guest password" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Source image *</label>
            <input className={inputCls} value={sourceImage} onChange={(e) => setSourceImage(e.target.value)} placeholder="projects/.../global/images/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Machine type *</label>
              <input className={inputCls} value={machineType} onChange={(e) => setMachineType(e.target.value)} placeholder="e.g. n2-standard-4" />
            </div>
            <div>
              <label className={labelCls}>Zone *</label>
              <input className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. europe-west1-b" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Count start</label>
              <input type="number" min={1} className={inputCls} value={countStart} onChange={(e) => setCountStart(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className={labelCls}>Count end</label>
              <input type="number" min={1} className={inputCls} value={countEnd} onChange={(e) => setCountEnd(parseInt(e.target.value) || 1)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createWorkshop.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
            >
              {createWorkshop.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workshop Card (list view)
// ---------------------------------------------------------------------------

interface WorkshopCardProps {
  workshop: Workshop
  attendeeCount: number
  onOpen: () => void
  onDelete: () => void
}

function WorkshopCard({ workshop, attendeeCount, onOpen, onDelete }: WorkshopCardProps) {
  const canDelete = workshop.status === 'draft' || workshop.status === 'ended'
  const total = slotCount(workshop)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="font-mono font-semibold text-slate-100 text-base truncate">{workshop.name}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={workshop.status} />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {attendeeCount} / {total}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onOpen}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Open
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
              title="Delete workshop"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div className="text-slate-500">Start</div>
        <div className="text-slate-400">{formatDt(workshop.start_time)}</div>
        <div className="text-slate-500">End</div>
        <div className="text-slate-400">{formatDt(workshop.end_time)}</div>
      </div>

      {workshop.status === 'deploying' && workshop.current_activity && (
        <div className="text-xs text-amber-400 font-mono truncate">{workshop.current_activity}</div>
      )}

      {workshop.portal_enabled && workshop.portal_url && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Portal</span>
          <a
            href={workshop.portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 truncate max-w-[200px]"
          >
            {workshop.portal_url}
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(workshop.portal_url!); toast.success('Copied.') }}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

interface DetailViewProps {
  workshopId: string
  onBack: () => void
}

function DetailView({ workshopId, onBack }: DetailViewProps) {
  const { data: workshop, isLoading, refetch: refetchWorkshop } = useWorkshop(workshopId)
  const updateWorkshop = useUpdateWorkshop()
  const { data: attendees = [], refetch: refetchAttendees } = useAttendees(workshopId)
  const removeAttendee = useRemoveAttendee()
  const startWorkshop = useStartWorkshop()
  const stopWorkshop = useStopWorkshop()

  // Poll workshop every 5s while deploying to show live current_activity
  // Poll attendees every 10s while running
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (workshop?.status === 'deploying') {
      pollRef.current = setInterval(() => refetchWorkshop(), 5_000)
    } else if (workshop?.status === 'running') {
      pollRef.current = setInterval(() => refetchAttendees(), 10_000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [workshop?.status])

  // Form state (settings)
  const [name, setName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [guestPassword, setGuestPassword] = useState('')
  const [docLink, setDocLink] = useState('')
  const [sourceImage, setSourceImage] = useState('')
  const [machineType, setMachineType] = useState('')
  const [zone, setZone] = useState('')
  const [countStart, setCountStart] = useState(1)
  const [countEnd, setCountEnd] = useState(1)
  const [hostnameTemplate, setHostnameTemplate] = useState('')
  const [fabricWorkspace, setFabricWorkspace] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!workshop) return
    setName(workshop.name)
    setPassphrase(workshop.passphrase)
    setGuestPassword(workshop.guest_password)
    setDocLink(workshop.doc_link ?? '')
    setSourceImage(workshop.source_image)
    setMachineType(workshop.machine_type)
    setZone(workshop.zone)
    setCountStart(workshop.count_start)
    setCountEnd(workshop.count_end)
    setHostnameTemplate(workshop.hostname_template ?? '')
    setFabricWorkspace(workshop.fabric_workspace ?? '')
    setStartTime(toLocalDatetimeInput(workshop.start_time))
    setEndTime(toLocalDatetimeInput(workshop.end_time))
  }, [workshop?.id])

  async function handleSave() {
    if (!workshop) return
    setSaving(true)
    try {
      await updateWorkshop.mutateAsync({
        id: workshop.id,
        data: {
          name,
          passphrase,
          guest_password: guestPassword,
          doc_link: docLink,
          source_image: sourceImage,
          machine_type: machineType,
          zone,
          count_start: countStart,
          count_end: countEnd,
          hostname_template: hostnameTemplate,
          fabric_workspace: fabricWorkspace,
          start_time: fromLocalDatetimeInput(startTime),
          end_time: fromLocalDatetimeInput(endTime),
        },
      })
      toast.success('Workshop saved.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStart() {
    if (!workshop) return
    try {
      await startWorkshop.mutateAsync(workshop.id)
      toast.success('Deployment started.')
      refetchWorkshop()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to start workshop.')
    }
  }

  async function handleStop() {
    if (!workshop) return
    try {
      await stopWorkshop.mutateAsync(workshop.id)
      toast.success('Teardown started.')
      refetchWorkshop()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop workshop.')
    }
  }

  async function handleTogglePortal() {
    if (!workshop) return
    try {
      await updateWorkshop.mutateAsync({
        id: workshop.id,
        data: { portal_enabled: !workshop.portal_enabled },
      })
      toast.success(workshop.portal_enabled ? 'Portal disabled.' : 'Portal enabled.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update portal.')
    }
  }

  function handleExportCsv() {
    if (!workshop) return
    const slots = Array.from({ length: slotCount(workshop) }, (_, i) => workshop.count_start + i)
    const rows = slots.map((n) => {
      const iName = slotName(workshop, n)
      const att = attendees.find((a) => a.instance_name === iName)
      return [
        iName,
        att?.name ?? '',
        att?.email ?? '',
        att?.company ?? '',
        att ? new Date(att.registered_at).toLocaleString() : '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const csv = ['Instance,Name,Email,Company,Registered at', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workshop.name}-attendees.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportPdf() {
    window.print()
  }

  async function handleRemoveAttendee(attendeeId: string) {
    if (!workshop) return
    try {
      await removeAttendee.mutateAsync({ workshopId: workshop.id, attendeeId })
      toast.success('Attendee removed.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove attendee.')
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1'

  if (isLoading || !workshop) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  const slots = Array.from({ length: slotCount(workshop) }, (_, i) => workshop.count_start + i)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Workshops
          </button>
          <span className="text-slate-700">/</span>
          <h1 className="text-base font-semibold text-slate-100 font-mono">{workshop.name}</h1>
          <StatusBadge status={workshop.status} />
        </div>
        <div className="flex items-center gap-2">
          {/* Start/Stop */}
          {(workshop.status === 'draft' || workshop.status === 'ended') && (
            <button
              onClick={handleStart}
              disabled={startWorkshop.isPending}
              className="px-3 py-1.5 rounded-lg text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5"
            >
              {startWorkshop.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Start
            </button>
          )}
          {workshop.status === 'deploying' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Deploying…
            </div>
          )}
          {(workshop.status === 'running' || workshop.status === 'deploying') && (
            <button
              onClick={handleStop}
              disabled={stopWorkshop.isPending}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-800/60 hover:bg-red-700/60 disabled:opacity-50 text-red-300 border border-red-700/40 transition-colors flex items-center gap-1.5"
            >
              {stopWorkshop.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Stop
            </button>
          )}
          {/* Portal toggle */}
          <button
            onClick={handleTogglePortal}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              workshop.portal_enabled
                ? 'bg-green-900/50 text-green-300 hover:bg-green-900/70 border border-green-700/50'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Portal {workshop.portal_enabled ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {/* Portal URL */}
      {workshop.portal_enabled && workshop.portal_url && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 text-xs">Portal URL:</span>
          <a
            href={workshop.portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs truncate max-w-md"
          >
            {workshop.portal_url}
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(workshop.portal_url!); toast.success('Copied.') }}
            className="text-slate-500 hover:text-slate-300"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Current activity panel */}
      {workshop.status === 'deploying' && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 flex items-center gap-3 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
          <span className="text-amber-300 font-mono text-xs truncate">
            {workshop.current_activity ?? 'Starting deployment…'}
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Left: Settings form */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Settings</h2>

          <div className="space-y-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Admin passphrase</label>
                <input className={inputCls} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Guest password</label>
                <input className={inputCls} value={guestPassword} onChange={(e) => setGuestPassword(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Documentation link</label>
              <input className={inputCls} value={docLink} onChange={(e) => setDocLink(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>Source image</label>
              <input className={inputCls} value={sourceImage} onChange={(e) => setSourceImage(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Machine type</label>
                <input className={inputCls} value={machineType} onChange={(e) => setMachineType(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Zone</label>
                <input className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Count start</label>
                <input type="number" min={1} className={inputCls} value={countStart} onChange={(e) => setCountStart(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label className={labelCls}>Count end</label>
                <input type="number" min={1} className={inputCls} value={countEnd} onChange={(e) => setCountEnd(parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Hostname template</label>
              <input className={inputCls} value={hostnameTemplate} onChange={(e) => setHostnameTemplate(e.target.value)} placeholder="e.g. {name}.example.com" />
            </div>
            <div>
              <label className={labelCls}>Fabric Workspace</label>
              <input className={inputCls} value={fabricWorkspace} onChange={(e) => setFabricWorkspace(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start time</label>
                <input type="datetime-local" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>End time</label>
                <input type="datetime-local" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>

        {/* Right: Status + Attendees */}
        <div className="space-y-4">

          {/* Deploying status panel */}
          {workshop.status === 'deploying' && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-sm font-medium text-amber-300">Deploying…</span>
              </div>
              {workshop.current_activity && (
                <div className="text-xs font-mono text-amber-400">{workshop.current_activity}</div>
              )}
            </div>
          )}

          {/* Attendees */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Attendees
                <span className="text-slate-500 font-normal">({attendees.length} / {slots.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                  title="Export CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                  title="Print / export PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left pb-2 font-medium pr-3">Instance</th>
                    <th className="text-left pb-2 font-medium pr-3">Name</th>
                    <th className="text-left pb-2 font-medium pr-3">Email</th>
                    <th className="text-left pb-2 font-medium pr-3">Company</th>
                    <th className="text-left pb-2 font-medium pr-3">Registered</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {slots.map((n) => {
                    const iName = slotName(workshop, n)
                    const att = attendees.find((a) => a.instance_name === iName)
                    return (
                      <tr key={n} className="border-b border-slate-800 hover:bg-slate-800/40">
                        <td className="py-1.5 pr-3 font-mono text-slate-300">{iName}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{att?.name ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{att?.email ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{att?.company ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400">
                          {att ? new Date(att.registered_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="py-1.5 text-right">
                          {att && (
                            <button
                              onClick={() => handleRemoveAttendee(att.id)}
                              className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                              title="Remove attendee"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Workshops page
// ---------------------------------------------------------------------------

export default function Workshops() {
  const { data: workshops = [], isLoading } = useWorkshops()
  const deleteWorkshop = useDeleteWorkshop()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  // Per-workshop attendee counts: fetch all via useAttendees individually is not ideal
  // We'll track them lazily — for the list view we just show what's cached
  const attendeeCounts: Record<string, number> = {}

  async function handleDelete(id: string) {
    if (!confirm('Delete this workshop? This cannot be undone.')) return
    try {
      await deleteWorkshop.mutateAsync(id)
      toast.success('Workshop deleted.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete.')
    }
  }

  if (selectedId) {
    return (
      <DetailView
        workshopId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">Workshops</h1>
            <DocLink path="workshops/" />
          </div>
          <p className="text-sm text-slate-500">Manage workshop deployments</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Workshop
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading workshops…
        </div>
      ) : workshops.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm font-medium">No workshops yet</p>
          <p className="text-slate-600 text-xs">Create a workshop to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {workshops.map((ws) => (
            <WorkshopCard
              key={ws.id}
              workshop={ws}
              attendeeCount={attendeeCounts[ws.id] ?? 0}
              onOpen={() => setSelectedId(ws.id)}
              onDelete={() => handleDelete(ws.id)}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewWorkshopModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => { setShowNewModal(false); setSelectedId(id) }}
        />
      )}
    </div>
  )
}
