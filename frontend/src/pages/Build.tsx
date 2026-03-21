import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Minus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'

const ZONES = ['europe-west4-a', 'asia-southeast1-b', 'us-central1-c']
const MACHINE_TYPES = [
  'n1-standard-1',
  'n1-standard-2',
  'n1-standard-4',
  'n1-standard-8',
  'n1-standard-16',
  'e2-medium',
]

interface LabelPair {
  key: string
  value: string
}

export default function Build() {
  const { data: settings } = useSettings()

  const [prepend, setPrepend] = useState(settings?.initials ?? '')
  const [product, setProduct] = useState('')
  const [zone, setZone] = useState(settings?.default_zone ?? ZONES[0])
  const [machineType, setMachineType] = useState(settings?.default_type ?? MACHINE_TYPES[0])
  const [image, setImage] = useState('')
  const [trialKey, setTrialKey] = useState('')
  const [group, setGroup] = useState(settings?.group ?? '')
  const [pocDefs, setPocDefs] = useState<string[]>(Array(8).fill(''))
  const [pocLaunch, setPocLaunch] = useState('')
  const [licenseServer, setLicenseServer] = useState(settings?.license_server ?? '')
  const [labels, setLabels] = useState<LabelPair[]>([])
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(1)
  const [pocDefsExpanded, setPocDefsExpanded] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  function addLabel() {
    setLabels((prev) => [...prev, { key: '', value: '' }])
  }

  function removeLabel(i: number) {
    setLabels((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateLabel(i: number, field: 'key' | 'value', val: string) {
    setLabels((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))
  }

  function updatePocDef(i: number, val: string) {
    setPocDefs((prev) => prev.map((v, idx) => (idx === i ? val : v)))
  }

  async function handleBuild() {
    if (!prepend || !product || !zone) {
      toast.error('Prepend, product, and zone are required')
      return
    }
    setBuilding(true)
    setStreamUrl(null)
    try {
      const payload = {
        prepend,
        product,
        zone,
        machine_type: machineType,
        image: image || undefined,
        trial_key: trialKey || undefined,
        group: group || undefined,
        poc_definitions: pocDefs.filter(Boolean),
        poc_launch: pocLaunch || undefined,
        license_server: licenseServer || undefined,
        labels: labels.reduce<Record<string, string>>((acc, { key, value }) => {
          if (key) acc[key] = value
          return acc
        }, {}),
        range_from: rangeFrom,
        range_to: rangeTo,
      }
      const result = await apiPost<{ job_id: string }>('/ops/build', payload)
      setStreamUrl(`/api/ops/${result.job_id}/stream`)
      toast.success('Build started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Build</h1>
        <p className="text-sm text-slate-400 mt-0.5">Create new Fabric Studio instances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Prepend (initials)</label>
              <input
                className={inputClass}
                value={prepend}
                onChange={(e) => setPrepend(e.target.value)}
                placeholder="e.g. tve"
              />
            </div>
            <div>
              <label className={labelClass}>Product name</label>
              <input
                className={inputClass}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. fwb"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Zone</label>
            <CustomSelect
              className={inputClass}
              value={zone}
              onChange={setZone}
              options={ZONES.map((z) => ({ value: z, label: z }))}
            />
          </div>

          <div>
            <label className={labelClass}>Machine type</label>
            <CustomSelect
              className={inputClass}
              value={machineType}
              onChange={setMachineType}
              options={MACHINE_TYPES.map((m) => ({ value: m, label: m }))}
            />
          </div>

          <div>
            <label className={labelClass}>Image</label>
            <input
              className={inputClass}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="Image name or family"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Trial key</label>
              <input
                className={inputClass}
                value={trialKey}
                onChange={(e) => setTrialKey(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className={labelClass}>Group</label>
              <input
                className={inputClass}
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>License server</label>
            <input
              className={inputClass}
              value={licenseServer}
              onChange={(e) => setLicenseServer(e.target.value)}
              placeholder="e.g. 10.0.0.1"
            />
          </div>

          <div>
            <label className={labelClass}>PoC Launch</label>
            <input
              className={inputClass}
              value={pocLaunch}
              onChange={(e) => setPocLaunch(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* PoC Definitions collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setPocDefsExpanded((v) => !v)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-2"
            >
              {pocDefsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              PoC Definitions (1–8)
            </button>
            {pocDefsExpanded && (
              <div className="space-y-2">
                {pocDefs.map((val, i) => (
                  <div key={i}>
                    <label className={labelClass}>PoC Definition {i + 1}</label>
                    <input
                      className={inputClass}
                      value={val}
                      onChange={(e) => updatePocDef(i, e.target.value)}
                      placeholder={`Definition ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional labels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass + ' mb-0'}>Additional labels</label>
              <button
                type="button"
                onClick={addLabel}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <Plus className="w-3.5 h-3.5" />
                Add label
              </button>
            </div>
            {labels.length > 0 && (
              <div className="space-y-2">
                {labels.map((label, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      className={inputClass}
                      placeholder="key"
                      value={label.key}
                      onChange={(e) => updateLabel(i, 'key', e.target.value)}
                    />
                    <span className="text-slate-600">=</span>
                    <input
                      className={inputClass}
                      placeholder="value"
                      value={label.value}
                      onChange={(e) => updateLabel(i, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeLabel(i)}
                      className="p-1.5 text-slate-500 hover:text-red-400 shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instance range */}
          <div>
            <label className={labelClass}>Instance range</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">From</label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">To</label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            {rangeTo >= rangeFrom && (
              <p className="text-xs text-slate-500 mt-1">
                Will create {rangeTo - rangeFrom + 1} instance{rangeTo - rangeFrom + 1 !== 1 ? 's' : ''} (#{rangeFrom} to #{rangeTo})
              </p>
            )}
          </div>

          <button
            onClick={handleBuild}
            disabled={building}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {building ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting build...
              </>
            ) : (
              'Build'
            )}
          </button>
        </div>

        {/* Right: Log output */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-slate-300 shrink-0">Build output</h2>
          <LogStream url={streamUrl} minHeight="min-h-96" className="flex-1 min-h-0" />
        </div>
      </div>
    </div>
  )
}
