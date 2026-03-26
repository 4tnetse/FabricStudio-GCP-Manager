import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Info } from 'lucide-react'
import { apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { useInstances, useZones, useZoneLocations } from '@/api/instances'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'
import { zoneLabel } from '@/lib/zones'


function InstanceCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: instances = [] } = useInstances()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const names = instances.map((i) => i.name).sort()
  const filtered = search
    ? names.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : names

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleFocus() {
    setSearch('')
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
        value={open ? search : value}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={handleFocus}
        onBlur={() => { if (!open) setSearch('') }}
        placeholder="e.g. fs-tve-fwb-000"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              className="flex w-full items-center px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 text-left"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(name); setSearch(''); setOpen(false) }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Clone() {
  const { data: settings } = useSettings()
  const { data: instances = [] } = useInstances()
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()

  const [source, setSource] = useState('')
  const [sourceZone, setSourceZone] = useState('')
  const [destZone, setDestZone] = useState('')
  const [cloneName, setCloneName] = useState('')
  const [sourcePrefix, setSourcePrefix] = useState('')

  const sourceSelected = !!sourceZone

  function handleSourceChange(name: string) {
    setSource(name)
    const match = instances.find((i) => i.name === name)
    const z = match ? match.zone : ''
    setSourceZone(z)
    setDestZone(z)
    const workshopMatch = name.match(/^([^-]+-[^-]+)-(.+)-\d{3}$/)
    if (workshopMatch) {
      setSourcePrefix(workshopMatch[1])
      setCloneName(match ? workshopMatch[2] : '')
    } else {
      setSourcePrefix('')
      setCloneName(match ? (name.replace(/-\d{3}$/, '')) : '')
    }
  }

  const [purpose, setPurpose] = useState('')

  // GCP label value: lowercase letters, digits, underscores, dashes, max 63 chars
  const LABEL_RE = /^[a-z0-9_-]{0,63}$/
  const purposeError = purpose && !LABEL_RE.test(purpose)
    ? 'Lowercase letters, digits, underscores and dashes only (max 63 chars)' : null

  // GCP instance name: lowercase letters/digits/hyphens, starts with letter, no trailing hyphen, max 59 chars
  const NAME_RE = /^[a-z][a-z0-9-]*$/
  const nameError = cloneName
    ? !NAME_RE.test(cloneName)
      ? 'Must start with a letter; only lowercase letters, digits and hyphens allowed'
      : cloneName.endsWith('-')
        ? 'Cannot end with a hyphen'
        : cloneName.length > 59
          ? 'Too long — max 59 characters (leaves room for -NNN suffix)'
          : null
    : null

  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(5)
  const [overwrite, setOverwrite] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [dnsWarning, setDnsWarning] = useState<string[] | null>(null)

  const count = rangeTo >= rangeFrom ? rangeTo - rangeFrom + 1 : 0
  const batches = Math.ceil(count / 5)

  const pad = (n: number) => String(n).padStart(3, '0')
  const fullBaseName = sourcePrefix ? `${sourcePrefix}-${cloneName}` : cloneName
  const namePreview = cloneName && !nameError && count > 0
    ? `${fullBaseName}-${pad(rangeFrom)}${count > 1 ? ` to ${fullBaseName}-${pad(rangeTo)}` : ''}`
    : null

  async function startClone() {
    setDnsWarning(null)
    setCloning(true)
    setStreamUrl(null)
    try {
      const result = await apiPost<{ job_id: string }>('/ops/clone', {
        source_name: source,
        zone: sourceZone,
        target_zone: destZone,
        clone_base_name: cloneName || undefined,
        purpose: purpose || undefined,
        count_start: rangeFrom,
        count_end: rangeTo,
        overwrite,
      })
      setStreamUrl(`/api/ops/${result.job_id}/stream`)
      toast.success('Clone operation started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clone failed')
    } finally {
      setCloning(false)
    }
  }

  async function handleClone() {
    if (!source) {
      toast.error('Source instance name is required')
      return
    }
    if (rangeTo < rangeFrom) {
      toast.error('Range "To" must be >= "From"')
      return
    }

    // Check DNS settings
    const missing: string[] = []
    if (!settings?.dns_domain) missing.push('DNS Domain')
    if (!settings?.instance_fqdn_prefix) missing.push('Instance FQDN prefix')
    if (!settings?.dns_zone_name) missing.push('DNS Zone name')
    if (missing.length > 0) {
      setDnsWarning(missing)
      return
    }

    await startClone()
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Clone</h1>
        <p className="text-sm text-slate-400 mt-0.5">Clone an existing instance to create multiple copies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5">
          <div>
            <label className={labelClass}>Source instance name</label>
            <InstanceCombobox value={source} onChange={handleSourceChange} />
            <p className="text-xs text-slate-500 mt-1">
              The base instance (000) that will be cloned
            </p>
          </div>

          <div>
            <label className={labelClass}>Workshop name</label>
            <input
              className={nameError
                ? inputClass.replace('border-slate-700', 'border-red-500').replace('focus:ring-blue-500', 'focus:ring-red-500')
                : !sourceSelected ? inputClass + ' opacity-50 cursor-not-allowed' : inputClass}
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="Auto-filled from source instance"
              disabled={!sourceSelected}
            />
            {nameError
              ? <p className="text-xs text-red-400 mt-1">{nameError}</p>
              : <p className="text-xs text-slate-500 mt-1">Base name for clones — number will be appended (e.g. {cloneName || 'name'}-001)</p>
            }
          </div>

          <div>
            <label className={labelClass}>Customer, Partner or Event</label>
            <input
              className={purposeError
                ? inputClass.replace('border-slate-700', 'border-red-500').replace('focus:ring-blue-500', 'focus:ring-red-500')
                : inputClass}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. fortinet-workshop"
            />
            {purposeError
              ? <p className="text-xs text-red-400 mt-1">{purposeError}</p>
              : <p className="text-xs text-slate-500 mt-1">Applied as purpose label on all cloned instances</p>
            }
          </div>

          <div>
            <label className={labelClass}>Destination zone</label>
            <CustomSelect
              className={inputClass}
              value={destZone}
              onChange={setDestZone}
              disabled={!destZone}
              options={zones.map((z) => ({ value: z, label: zoneLabel(z, zoneLocations) }))}
              placeholder="Auto-filled from source instance"
              searchable
            />
          </div>

          <div>
            <label className={labelClass}>Clone range</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">From</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  className={inputClass}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">To</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  className={inputClass}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
          </div>

          {count > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-slate-600 bg-slate-800/60 text-xs text-slate-300">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div>
                  Will create <strong>{count}</strong> instance{count !== 1 ? 's' : ''}.
                  {batches > 1 && (
                    <> Runs in <strong>{batches}</strong> batches of up to 5.</>
                  )}
                </div>
                {namePreview && (
                  <div className="font-mono text-slate-400">{namePreview}</div>
                )}
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
            />
            <div>
              <span className="text-sm text-slate-300">Delete existing instances</span>
              <p className="text-xs text-slate-500 mt-0.5">
                If unchecked, instances that already exist are skipped.
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Instances that have the label delete set to no, will not be deleted.
              </p>
            </div>
          </label>

          <button
            onClick={handleClone}
            disabled={cloning || streaming || count === 0 || !cloneName || !!nameError || !!purposeError}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {cloning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting clone...
              </>
            ) : streaming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cloning...
              </>
            ) : (
              'Clone'
            )}
          </button>
        </div>

        {/* Log output */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-slate-300 shrink-0">Output</h2>
          <LogStream url={streamUrl} minHeight="min-h-80" className="flex-1 min-h-0" onStreamingChange={setStreaming} />
        </div>
      </div>

      {/* DNS warning dialog */}
      {dnsWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-yellow-800 bg-slate-900 shadow-2xl p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-2">DNS settings incomplete</h2>
            <p className="text-sm text-slate-400 mb-2">
              The following DNS settings are missing — no DNS records will be created:
            </p>
            <ul className="text-sm text-yellow-400 list-disc list-inside mb-4 space-y-0.5">
              {dnsWarning.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="text-sm text-slate-400 mb-4">
              You can configure these in Settings. Continue without DNS record creation?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDnsWarning(null)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={startClone}
                className="px-3 py-1.5 rounded-lg text-sm bg-yellow-700 hover:bg-yellow-600 text-white"
              >
                Continue without DNS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
