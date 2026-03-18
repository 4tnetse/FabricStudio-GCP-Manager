import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Info } from 'lucide-react'
import { apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { useInstances } from '@/api/instances'
import { LogStream } from '@/components/LogStream'

const ZONES = ['europe-west4-a', 'asia-southeast1-b', 'us-central1-c']

function InstanceCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: instances = [] } = useInstances()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const names = instances.map((i) => i.name).sort()
  const filtered = value
    ? names.filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    : names

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
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
              onClick={() => { onChange(name); setOpen(false) }}
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

  const [source, setSource] = useState('')
  const [zone, setZone] = useState(settings?.default_zone ?? ZONES[0])

  function handleSourceChange(name: string) {
    setSource(name)
    const match = instances.find((i) => i.name === name)
    if (match) setZone(match.zone)
  }
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(5)
  const [overwrite, setOverwrite] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [dnsWarning, setDnsWarning] = useState<string[] | null>(null)

  const count = rangeTo >= rangeFrom ? rangeTo - rangeFrom + 1 : 0
  const batches = Math.ceil(count / 5)

  // Derive base name and preview from source (strip last -NNN segment)
  const baseName = source.match(/^(.+)-\d{3}$/) ? source.replace(/-\d{3}$/, '') : source
  const pad = (n: number) => String(n).padStart(3, '0')
  const namePreview = baseName && count > 0
    ? `${baseName}-${pad(rangeFrom)}${count > 1 ? ` to ${baseName}-${pad(rangeTo)}` : ''}`
    : null

  async function startClone() {
    setDnsWarning(null)
    setCloning(true)
    setStreamUrl(null)
    try {
      const result = await apiPost<{ job_id: string }>('/ops/clone', {
        source_name: source,
        zone,
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

      <div className="space-y-6">
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
            <label className={labelClass}>Zone</label>
            <input
              className={inputClass}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="e.g. europe-west1-b"
            />
            <p className="text-xs text-slate-500 mt-1">Auto-filled from source instance</p>
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
            disabled={cloning || streaming || count === 0}
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
        {streamUrl && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-slate-300">Clone output</h2>
            <LogStream url={streamUrl} minHeight="min-h-80" onStreamingChange={setStreaming} />
          </div>
        )}
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
