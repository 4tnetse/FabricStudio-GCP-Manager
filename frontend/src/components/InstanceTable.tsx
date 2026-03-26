import { useState, useMemo, useRef, useEffect } from 'react'
import { CustomSelect } from '@/components/CustomSelect'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPost } from '@/api/client'
import {
  Search,
  X,
  Play,
  Square,
  PowerOff,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Pencil,
  Cpu,
  ArrowRightLeft,
  Tag,
  Loader2,
} from 'lucide-react'
import {
  useInstances,
  useStartInstance,
  useStopInstance,
  useDeleteInstance,
  useSetMachineType,
  useRenameInstance,
  useMoveInstance,
  useBulkOperation,
  useZones,
  useMachineTypes,
  useZoneLocations,
} from '@/api/instances'
import { useMachineTypePrice } from '@/api/costs'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/api/settings'
import { useTheme } from '@/context/ThemeContext'
import { StatusBadge } from './StatusBadge'
import { cn } from '@/lib/utils'
import { zoneLabel } from '@/lib/zones'
import type { Instance } from '@/lib/types'

function showShutdownToasts(results: { name: string; status: string; message?: string }[]) {
  const ok = results.filter((r) => r.status === 'ok')
  const errors = results.filter((r) => r.status === 'error')
  if (ok.length > 0)
    toast.success(`Shutdown command sent to ${ok.length} instance${ok.length !== 1 ? 's' : ''}`)
  for (const r of errors) {
    const isAuth = r.message?.toLowerCase().includes('login failed') || r.message?.toLowerCase().includes('401')
    toast.error(
      isAuth
        ? `${r.name}: Authentication failed — check the admin password in Settings`
        : `${r.name}: ${r.message || 'Shutdown failed'}`,
    )
  }
}

function buildFqdn(name: string, prefix: string, domain: string): string | null {
  if (name.startsWith('srv')) return null
  const match = name.match(/^[^-]+-[^-]+-(.+)-(\d+)$/)
  if (!match) return null
  const product = match[1]
  const number = parseInt(match[2], 10)
  return `${prefix}${number}.${product}.${domain}`
}

const ALL_STATUSES = ['RUNNING', 'TERMINATED', 'STAGING', 'PROVISIONING', 'STOPPING', 'UNKNOWN'] as const

interface InstanceDetailDialogProps {
  instance: Instance
  onClose: () => void
  dnsPrefix?: string
  dnsDomain?: string
}

function InstanceDetailDialog({ instance, onClose, dnsPrefix, dnsDomain }: InstanceDetailDialogProps) {
  const fqdn = instance.public_ip && dnsPrefix && dnsDomain
    ? buildFqdn(instance.name, dnsPrefix, dnsDomain)
    : null
  const { data: priceData } = useMachineTypePrice(instance.machine_type, instance.zone)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{instance.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Status</span>
            <StatusBadge status={instance.status} />
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Zone</span>
            <span className="text-sm text-slate-200">{instance.zone}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Machine type</span>
            <span className="text-sm text-slate-200">{instance.machine_type}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">vCPUs</span>
            <span className="text-sm text-slate-200">
              {priceData?.vcpus != null ? priceData.vcpus : '...'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Memory</span>
            <span className="text-sm text-slate-200">
              {priceData?.memory_gib != null ? `${priceData.memory_gib} GB` : '...'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Boot disk</span>
            <span className="text-sm text-slate-200">
              {instance.boot_disk_gb != null ? `${instance.boot_disk_gb} GB` : '—'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Estimated hourly cost</span>
            <span className="text-sm text-slate-200">
              {priceData === undefined
                ? '...'
                : priceData.price_usd != null
                  ? `${priceData.source === 'fallback' ? '~' : ''}$${priceData.price_usd.toFixed(4)} / hr`
                  : '—'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Public IP</span>
            <span className="text-sm text-slate-200">{instance.public_ip ?? '—'}</span>
          </div>
          {fqdn && (
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-sm text-slate-400">FQDN</span>
              <span className="text-sm text-slate-200">{fqdn}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Internal IP</span>
            <span className="text-sm text-slate-200">{instance.internal_ip ?? '—'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-sm text-slate-400">Created</span>
            <span className="text-sm text-slate-200">
              {instance.creation_timestamp
                ? new Date(instance.creation_timestamp).toLocaleString()
                : '—'}
            </span>
          </div>
          {Object.keys(instance.labels).length > 0 && (
            <div className="py-2 border-b border-slate-800">
              <span className="text-sm text-slate-400 block mb-2">Labels</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(instance.labels).map(([k, v]) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300"
                  >
                    {k}={v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {instance.tags.length > 0 && (
            <div className="py-2">
              <span className="text-sm text-slate-400 block mb-2">Tags (firewall rules)</span>
              <div className="flex flex-wrap gap-1.5">
                {instance.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface RenameDialogProps {
  instance: Instance
  onClose: () => void
  onConfirm: (newName: string) => void
}

function RenameDialog({ instance, onClose, onConfirm }: RenameDialogProps) {
  const [value, setValue] = useState(instance.name)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100 mb-4">Rename Instance</h2>
        <input
          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm(value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}

interface MachineTypeDialogProps {
  instance: Instance
  onClose: () => void
  onConfirm: (machineType: string) => void
}

function MachineTypeDialog({ instance, onClose, onConfirm }: MachineTypeDialogProps) {
  const [value, setValue] = useState(instance.machine_type)
  const { data: machineTypes = [], isLoading } = useMachineTypes(instance.zone)
  const options = isLoading
    ? [{ value: instance.machine_type, label: instance.machine_type }]
    : machineTypes.map((mt) => ({ value: mt, label: mt }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100 mb-4">Change Machine Type</h2>
        <p className="text-xs text-slate-400 mb-1">Instance must be stopped first.</p>
        <p className="text-xs mb-3"><a href="https://cloud.google.com/compute/vm-instance-pricing" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">Machine Cost Calculator</a></p>
        <CustomSelect
          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
          value={value}
          onChange={setValue}
          options={options}
          searchable
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

interface MoveZoneDialogProps {
  instance: Instance
  onClose: () => void
  onConfirm: (zone: string) => void
}

function MoveZoneDialog({ instance, onClose, onConfirm }: MoveZoneDialogProps) {
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()
  const otherZones = zones.filter((z) => z !== instance.zone)
  const [value, setValue] = useState('')
  useEffect(() => { if (!value && otherZones.length) setValue(otherZones[0]) }, [otherZones.length])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100 mb-4">Move to Zone</h2>
        <p className="text-xs text-slate-400 mb-3">Current zone: {zoneLabel(instance.zone, zoneLocations)}</p>
        <CustomSelect
          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
          value={value}
          onChange={setValue}
          placeholder="Select a zone..."
          options={otherZones.map((z) => ({ value: z, label: zoneLabel(z, zoneLocations) }))}
          searchable
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            disabled={!value}
            className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  )
}

interface DeleteConfirmProps {
  names: string[]
  onClose: () => void
  onConfirm: () => void
}

function DeleteConfirmDialog({ names, onClose, onConfirm }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-red-900 bg-slate-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100 mb-2">Delete Instance{names.length > 1 ? 's' : ''}</h2>
        <p className="text-sm text-slate-400 mb-4">
          This will permanently delete{' '}
          {names.length === 1 ? (
            <span className="text-slate-200">{names[0]}</span>
          ) : (
            <span className="text-slate-200">{names.length} instances</span>
          )}
          . This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

interface RowActionsProps {
  instance: Instance
}

function RowActions({ instance }: RowActionsProps) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'rename' | 'machine-type' | 'move' | 'delete' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const startInstance = useStartInstance()
  const stopInstance = useStopInstance()
  const deleteInstance = useDeleteInstance()
  const setMachineType = useSetMachineType()
  const renameInstance = useRenameInstance()
  const moveInstance = useMoveInstance()

  const isPending =
    startInstance.isPending ||
    stopInstance.isPending ||
    deleteInstance.isPending ||
    setMachineType.isPending ||
    renameInstance.isPending ||
    moveInstance.isPending

  async function handleStart() {
    setOpen(false)
    try {
      await startInstance.mutateAsync({ zone: instance.zone, name: instance.name })
      toast.success(`Start triggered for ${instance.name} — status will update shortly`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  async function handleStop() {
    setOpen(false)
    try {
      await stopInstance.mutateAsync({ zone: instance.zone, name: instance.name })
      toast.success(`Stop triggered for ${instance.name} — status will update shortly`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop')
    }
  }

  async function handleShutdown() {
    setOpen(false)
    toast.success(`Initiating shutdown for ${instance.name} — status will update shortly`)
    try {
      const res = await apiPost<{ results: { name: string; status: string; message?: string }[] }>(
        '/ops/bulk-shutdown',
        { instances: [{ zone: instance.zone, name: instance.name }] },
      )
      showShutdownToasts(res.results)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to shutdown')
    }
  }

  async function handleDelete() {
    setDialog(null)
    try {
      await deleteInstance.mutateAsync({ zone: instance.zone, name: instance.name })
      toast.success(`Delete triggered for ${instance.name} — it will disappear shortly`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function handleRename(newName: string) {
    setDialog(null)
    try {
      await renameInstance.mutateAsync({ zone: instance.zone, name: instance.name, new_name: newName })
      toast.success('Instance renamed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename')
    }
  }

  async function handleMachineType(machineType: string) {
    setDialog(null)
    try {
      await setMachineType.mutateAsync({ zone: instance.zone, name: instance.name, machine_type: machineType })
      toast.success('Machine type updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update machine type')
    }
  }

  async function handleMove(zone: string) {
    setDialog(null)
    try {
      await moveInstance.mutateAsync({ zone: instance.zone, name: instance.name, target_zone: zone })
      toast.success('Instance moved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move instance')
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
          disabled={isPending}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {instance.status === 'TERMINATED' && (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <Play className="w-3.5 h-3.5 text-green-400" />
                Start
              </button>
            )}
            {instance.status === 'RUNNING' && (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <Square className="w-3.5 h-3.5 text-yellow-400" />
                Stop
              </button>
            )}
            {instance.status === 'RUNNING' && (
              <button
                onClick={handleShutdown}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <PowerOff className="w-3.5 h-3.5 text-orange-400" />
                Shutdown
              </button>
            )}
            <button
              onClick={() => { setOpen(false); setDialog('rename') }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
              Rename
            </button>
            <button
              onClick={() => { setOpen(false); setDialog('machine-type') }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              Change Machine Type
            </button>
            <button
              onClick={() => { setOpen(false); setDialog('move') }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
              Move Zone
            </button>
            <button
              onClick={() => { setOpen(false); navigate(`/labels?select=${encodeURIComponent(`${instance.zone}|||${instance.name}`)}`) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              Edit Labels
            </button>
            <div className="border-t border-slate-800" />
            <button
              onClick={() => { setOpen(false); setDialog('delete') }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {dialog === 'rename' && (
        <RenameDialog
          instance={instance}
          onClose={() => setDialog(null)}
          onConfirm={handleRename}
        />
      )}
      {dialog === 'machine-type' && (
        <MachineTypeDialog
          instance={instance}
          onClose={() => setDialog(null)}
          onConfirm={handleMachineType}
        />
      )}
      {dialog === 'move' && (
        <MoveZoneDialog
          instance={instance}
          onClose={() => setDialog(null)}
          onConfirm={handleMove}
        />
      )}
      {dialog === 'delete' && (
        <DeleteConfirmDialog
          names={[instance.name]}
          onClose={() => setDialog(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}

export interface InstanceTableProps {
  defaultZone?: string
  defaultStatus?: string
}

export function InstanceTable({ defaultZone, defaultStatus }: InstanceTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatus ?? '')
  const [zoneFilter, setZoneFilter] = useState<string>('')
  const [purposeFilter, setPurposeFilter] = useState<string>('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailInstance, setDetailInstance] = useState<Instance | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkJobId, setBulkJobId] = useState<string | null>(null)

  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'

  const queryClient = useQueryClient()
  const { data: instances = [], isLoading, isFetching, refetch } = useInstances()
  const { data: settings } = useSettings()
  const { data: zoneLocations = {} } = useZoneLocations()
  const dnsPrefix = settings?.instance_fqdn_prefix as string | undefined
  const dnsDomain = settings?.dns_domain as string | undefined
  const hasDns = !!(dnsPrefix && dnsDomain)
  const bulkOp = useBulkOperation()
  const startInstance = useStartInstance()
  const stopInstance = useStopInstance()

  const filtered = useMemo(() => {
    return instances.filter((inst) => {
      if (search && !inst.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter && inst.status !== statusFilter) return false
      if (zoneFilter && inst.zone !== zoneFilter) return false
      if (purposeFilter && inst.labels?.purpose !== purposeFilter) return false
      if (groupFilter && inst.labels?.group !== groupFilter) return false
      return true
    })
  }, [instances, search, statusFilter, zoneFilter, purposeFilter, groupFilter])

  const zones = useMemo(() => {
    return Array.from(new Set(instances.map((i) => i.zone))).sort()
  }, [instances])

  const purposes = useMemo(() => {
    return Array.from(new Set(
      instances.map((i) => i.labels?.purpose).filter(Boolean) as string[]
    )).sort()
  }, [instances])

  const groups = useMemo(() => {
    return Array.from(new Set(
      instances.map((i) => i.labels?.group).filter(Boolean) as string[]
    )).sort()
  }, [instances])

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((i) => `${i.zone}/${i.name}`)))
    }
  }

  const selectedInstances = filtered.filter((i) => selected.has(`${i.zone}/${i.name}`))

  async function handleBulkStart() {
    try {
      for (const inst of selectedInstances) {
        await startInstance.mutateAsync({ zone: inst.zone, name: inst.name })
      }
      toast.success(`Starting ${selectedInstances.length} instance${selectedInstances.length !== 1 ? 's' : ''}`)
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk start failed')
    }
  }

  async function handleBulkStop() {
    try {
      for (const inst of selectedInstances) {
        await stopInstance.mutateAsync({ zone: inst.zone, name: inst.name })
      }
      toast.success(`Stopping ${selectedInstances.length} instance${selectedInstances.length !== 1 ? 's' : ''}`)
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk stop failed')
    }
  }

  async function handleBulkShutdown() {
    toast.success(`Initiating shutdown for ${selectedInstances.length} instance${selectedInstances.length !== 1 ? 's' : ''} — status will update shortly`)
    try {
      const res = await apiPost<{ results: { name: string; status: string; message?: string }[] }>(
        '/ops/bulk-shutdown',
        { instances: selectedInstances.map((i) => ({ zone: i.zone, name: i.name })) },
      )
      showShutdownToasts(res.results)
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk shutdown failed')
    }
  }

  async function handleBulkDelete() {
    setBulkDeleteConfirm(false)
    const all = [...selectedInstances]
    setSelected(new Set())

    const protected_ = all.filter((i) => i.labels?.delete === 'no')
    const toDelete = all.filter((i) => i.labels?.delete !== 'no')

    if (protected_.length > 0) {
      const names = protected_.map((i) => i.name).join(', ')
      toast.warning(`Skipped ${protected_.length} protected instance${protected_.length !== 1 ? 's' : ''} (label delete=no): ${names}`)
    }

    if (toDelete.length === 0) return

    // Optimistic removal
    queryClient.setQueriesData<Instance[]>({ queryKey: ['instances'] }, (old) => {
      if (!Array.isArray(old)) return old
      const keys = new Set(toDelete.map((i) => `${i.zone}/${i.name}`))
      return old.filter((i) => !keys.has(`${i.zone}/${i.name}`))
    })
    try {
      await bulkOp.mutateAsync({
        operation: 'bulk-delete',
        instances: toDelete.map((i) => ({ zone: i.zone, name: i.name })),
      })
      const names = toDelete.map((i) => i.name).join(', ')
      toast.success(`Delete triggered for ${names} — ${toDelete.length === 1 ? 'it' : 'they'} will disappear shortly`)
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed')
    } finally {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    }
  }


  return (
    <div className="flex flex-col h-full gap-3 rounded-xl border border-slate-700 bg-slate-800/30 p-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search instances..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {groups.length > 0 && (
          <CustomSelect
            value={groupFilter}
            onChange={setGroupFilter}
            className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            options={[{ value: '', label: 'All groups' }, ...groups.map((g) => ({ value: g, label: g }))]}
          />
        )}
        {purposes.length > 0 && (
          <CustomSelect
            value={purposeFilter}
            onChange={setPurposeFilter}
            className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            options={[{ value: '', label: 'All purposes' }, ...purposes.map((p) => ({ value: p, label: p }))]}
          />
        )}
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          options={[{ value: '', label: 'All statuses' }, ...ALL_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <CustomSelect
          value={zoneFilter}
          onChange={setZoneFilter}
          className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          options={[{ value: '', label: 'All zones' }, ...zones.map((z) => ({ value: z, label: z }))]}
        />
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className={cn('flex items-center gap-3 px-4 py-2.5 rounded-lg', isSF ? 'bg-slate-800 border border-slate-700' : 'border border-blue-800 bg-blue-900/20')}>
          <span className={cn('text-sm', isSF ? 'text-slate-300' : 'text-blue-300')}>{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleBulkStart}
              disabled={bulkOp.isPending}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50', isSF ? 'bg-slate-700 hover:bg-slate-600 text-green-400' : 'bg-green-800/60 hover:bg-green-700/60 text-green-300 border border-green-800')}
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </button>
            <button
              onClick={handleBulkStop}
              disabled={bulkOp.isPending}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50', isSF ? 'bg-slate-700 hover:bg-slate-600 text-yellow-400' : 'bg-yellow-900/40 hover:bg-yellow-800/40 text-yellow-300 border border-yellow-800')}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
            <button
              onClick={handleBulkShutdown}
              disabled={bulkOp.isPending}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50', isSF ? 'bg-slate-700 hover:bg-slate-600 text-orange-400' : 'bg-orange-900/40 hover:bg-orange-800/40 text-orange-300 border border-orange-800')}
            >
              <PowerOff className="w-3.5 h-3.5" />
              Shutdown
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkOp.isPending}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50', isSF ? 'bg-slate-700 hover:bg-slate-600 text-[#db291c]' : 'bg-red-900/40 hover:bg-red-800/40 text-red-300 border border-red-800')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/60">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className={cn('rounded border-slate-600 bg-slate-700', isSF ? 'focus:ring-red-500' : 'text-blue-500 focus:ring-blue-500')} style={isSF ? { accentColor: '#db291c' } : undefined}
                  />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Name</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Zone</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Status</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Machine Type</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Public IP</th>
                {hasDns && <th className="text-left px-3 py-2.5 font-medium text-slate-300">FQDN</th>}
                <th className="text-left px-3 py-2.5 font-medium text-slate-300">Labels</th>
                <th className="w-12 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading instances...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No instances found
                  </td>
                </tr>
              ) : (
                filtered.map((instance) => {
                  const key = `${instance.zone}/${instance.name}`
                  const isSelected = selected.has(key)
                  const labelEntries = Object.entries(instance.labels).slice(0, 3)
                  return (
                    <tr
                      key={key}
                      onClick={() => setDetailInstance(instance)}
                      className={cn(
                        'border-b border-slate-800 cursor-pointer transition-colors',
                        isSelected ? (isSF ? 'bg-slate-800/40' : 'bg-blue-900/10') : 'hover:bg-slate-800/40',
                      )}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(key)}
                          className={cn('rounded border-slate-600 bg-slate-700', isSF ? 'focus:ring-red-500' : 'text-blue-500 focus:ring-blue-500')} style={isSF ? { accentColor: '#db291c' } : undefined}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap">{instance.name}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">{instance.zone}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusBadge status={instance.status} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">{instance.machine_type}</td>
                      <td className="px-3 py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        {instance.public_ip
                          ? <a href={`https://${instance.public_ip}`} target="_blank" rel="noreferrer" className="text-slate-200 hover:text-white hover:underline">{instance.public_ip}</a>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      {hasDns && (
                        <td className="px-3 py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                          {instance.public_ip
                            ? (() => {
                                const fqdn = buildFqdn(instance.name, dnsPrefix!, dnsDomain!)
                                return fqdn
                                  ? <a href={`https://${fqdn}`} target="_blank" rel="noreferrer" className="text-slate-200 hover:text-white hover:underline">{fqdn}</a>
                                  : <span className="text-slate-600">—</span>
                              })()
                            : <span className="text-slate-600">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex gap-1">
                          {labelEntries.map(([k, v]) => (
                            <span
                              key={k}
                              className="px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap"
                            >
                              {k}={v}
                            </span>
                          ))}
                          {Object.keys(instance.labels).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs text-slate-500">
                              +{Object.keys(instance.labels).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <RowActions instance={instance} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-500 flex items-center justify-between">
          <span>
            {filtered.length} of {instances.length} instances
            {(search || statusFilter || zoneFilter || purposeFilter || groupFilter) && ' (filtered)'}
          </span>
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Refreshing...
            </span>
          )}
        </div>
      </div>

      {detailInstance && (
        <InstanceDetailDialog
          instance={detailInstance}
          onClose={() => setDetailInstance(null)}
          dnsPrefix={dnsPrefix}
          dnsDomain={dnsDomain}
        />
      )}

      {bulkDeleteConfirm && (
        <DeleteConfirmDialog
          names={selectedInstances.map((i) => i.name)}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
        />
      )}

    </div>
  )
}
