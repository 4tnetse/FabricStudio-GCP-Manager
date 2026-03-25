import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react'
import { apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { useInstances } from '@/api/instances'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'

function formatSelection(names: Set<string>): string {
  if (names.size === 0) return ''
  const arr = [...names].sort()
  if (arr.length === 1) return arr[0]

  const parseNum = (name: string) => {
    const m = name.match(/^(.+)-(\d+)$/)
    return m ? { base: m[1], num: parseInt(m[2]), pad: m[2].length } : null
  }

  const parsed = arr.map(parseNum)
  if (parsed.every((p) => p && p.base === parsed[0]!.base)) {
    const nums = parsed.map((p) => p!.num).sort((a, b) => a - b)
    const isContiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
    if (isContiguous) {
      const base = parsed[0]!.base
      const pad = parsed[0]!.pad
      const from = String(nums[0]).padStart(pad, '0')
      const to = String(nums[nums.length - 1]).padStart(pad, '0')
      return `${base}-${from} to ${base}-${to}`
    }
  }

  if (arr.length <= 3) return arr.join(', ')
  return `${arr.slice(0, 2).join(', ')} +${arr.length - 2} more`
}

export default function Configure() {
  const { data: settings } = useSettings()
  const { data: instances = [], isLoading: instancesLoading } = useInstances()

  // Instance selection
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState<number | ''>('')

  // Configure params
  const [oldAdminPassword, setOldAdminPassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [trialKey, setTrialKey] = useState('')
  const [licenseServer, setLicenseServer] = useState(settings?.license_server ?? '')
  const [pocLaunch, setPocLaunch] = useState('')
  const [pocDefs, setPocDefs] = useState<string[]>(Array(8).fill(''))
  const [pocDefsExpanded, setPocDefsExpanded] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const filtered = useMemo(
    () => instances.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [instances, search],
  )

  function toggleInstance(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      filtered.forEach((i) => next.add(i.name))
      return next
    })
  }

  function clearSelection() {
    setSelectedNames(new Set())
  }

  function applyRange() {
    if (!rangeFrom || rangeTo === '') {
      toast.error('Select a from instance and enter a to number')
      return
    }
    const match = rangeFrom.match(/^(.+)-(\d+)$/)
    if (!match) {
      toast.error('Could not parse instance name')
      return
    }
    const base = match[1]
    const start = parseInt(match[2])
    const end = Number(rangeTo)
    if (end < start) {
      toast.error('"To" must be >= the from instance number')
      return
    }
    const pad = (n: number) => String(n).padStart(match[2].length, '0')
    const names = Array.from({ length: end - start + 1 }, (_, i) => `${base}-${pad(start + i)}`)
    const found = names.filter((n) => instances.some((i) => i.name === n))
    if (found.length === 0) {
      toast.error('No instances found in that range')
      return
    }
    setSelectedNames(new Set(found))
    toast.success(`Selected ${found.length} instance${found.length !== 1 ? 's' : ''} from range`)
  }

  function updatePocDef(i: number, val: string) {
    setPocDefs((prev) => prev.map((v, idx) => (idx === i ? val : v)))
  }

  async function handleConfigure() {
    if (selectedNames.size === 0) {
      toast.error('Select at least one instance')
      return
    }
    const items = [...selectedNames].map((name) => {
      const inst = instances.find((i) => i.name === name)
      return { name, zone: inst?.zone ?? '' }
    })
    setConfiguring(true)
    setStreamUrl(null)
    try {
      const payload = {
        instances: items,
        old_admin_password: oldAdminPassword || undefined,
        admin_password: adminPassword || undefined,
        trial_key: trialKey || undefined,
        license_server: licenseServer || undefined,
        poc_launch: pocLaunch || undefined,
        poc_definitions: pocDefs.filter(Boolean),
      }
      const result = await apiPost<{ job_id: string }>('/ops/bulk-configure', payload)
      setStreamUrl(`/api/ops/${result.job_id}/stream`)
      toast.success('Configure started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Configure failed')
    } finally {
      setConfiguring(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Configure</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure Fabric Studio instances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: one widget with two sections */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30">

          {/* Section 1: Instance selection */}
          <div className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">1. Select instances</h2>

            {/* Select by name */}
            <div>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm hover:bg-slate-700 transition-colors"
              >
                <span className="text-slate-500">Select instances by name…</span>
                {pickerOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              {pickerOpen && (
                <div className="mt-1 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
                  <div className="flex items-center gap-2 p-2 border-b border-slate-800">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Filter…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none"
                      />
                      {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={selectAllFiltered}
                      className="px-2.5 py-1.5 rounded text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 border border-slate-700 whitespace-nowrap"
                    >
                      {search ? `Select ${filtered.length} filtered` : 'Select all'}
                    </button>
                    <button
                      onClick={clearSelection}
                      disabled={selectedNames.size === 0}
                      className="px-2.5 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700 disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {instancesLoading ? (
                      <div className="px-3 py-4 text-center">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500">No instances found</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-px bg-slate-800">
                        {filtered.map((inst) => {
                          const checked = selectedNames.has(inst.name)
                          return (
                            <button
                              key={`${inst.zone}/${inst.name}`}
                              onClick={() => toggleInstance(inst.name)}
                              className={`flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                                checked ? 'bg-blue-900/40 text-blue-200' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                                checked ? 'bg-blue-600 border-blue-600' : 'border-slate-600'
                              }`}>
                                {checked && (
                                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 10 8">
                                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <span className="truncate">{inst.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-1.5 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
                    <span>{filtered.length} shown{search ? ` (filtered from ${instances.length})` : ''}</span>
                    <span>{selectedNames.size} selected</span>
                  </div>
                </div>
              )}
            </div>

            {/* Select by range */}
            <div>
              <button
                onClick={() => setRangeOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm hover:bg-slate-700 transition-colors"
              >
                <span className="text-slate-500">Select instances by range...</span>
                {rangeOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              {rangeOpen && (
                <div className="mt-1 rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>From instance</label>
                      <CustomSelect
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={rangeFrom}
                        onChange={setRangeFrom}
                        options={[{ value: '', label: 'Select…' }, ...instances.map((i) => ({ value: i.name, label: i.name }))]}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>To number</label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
                        placeholder="e.g. 23"
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value === '' ? '' : parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyRange}
                    className="w-full py-1.5 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 text-sm transition-colors"
                  >
                    Apply range
                  </button>
                </div>
              )}
            </div>

            {/* Selection summary */}
            {selectedNames.size > 0 && (
              <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800/40">
                <div className="text-xs text-blue-300 min-w-0">
                  <span className="font-medium">{selectedNames.size} instance{selectedNames.size !== 1 ? 's' : ''} selected: </span>
                  <span className="font-mono">{formatSelection(selectedNames)}</span>
                </div>
                <button onClick={clearSelection} className="text-blue-500 hover:text-blue-300 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Configuration */}
          <div className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-200">2. Configure</h2>
            <p className="text-xs text-slate-500 -mt-2">Make sure the selected instances are running.</p>

            <div>
              <label className={labelClass}>Admin password</label>
              <input
                className={inputClass}
                type="password"
                value={oldAdminPassword}
                onChange={(e) => setOldAdminPassword(e.target.value)}
                placeholder="Leave empty to use Settings default"
              />
            </div>

            <div>
              <label className={labelClass}>New admin password</label>
              <input
                className={inputClass}
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className={labelClass}>Fabric Studio Registration token:secret</label>
              <input
                className={inputClass}
                value={trialKey}
                onChange={(e) => setTrialKey(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className={labelClass}>Fabric Studio License Server IP address</label>
              <input
                className={inputClass}
                value={licenseServer}
                onChange={(e) => setLicenseServer(e.target.value)}
                placeholder={settings?.license_server ? `e.g. ${settings.license_server}` : 'e.g. 10.20.30.2'}
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

            <button
              onClick={handleConfigure}
              disabled={configuring || streaming || selectedNames.size === 0}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {configuring || streaming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Configuring...
                </>
              ) : (
                `Configure${selectedNames.size > 0 ? ` (${selectedNames.size})` : ''}`
              )}
            </button>
          </div>

        </div>{/* end left widget */}

        {/* Right: log output */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-slate-300 shrink-0">Output</h2>
          <LogStream url={streamUrl} minHeight="min-h-96" className="flex-1 min-h-0" onStreamingChange={setStreaming} />
        </div>
      </div>
    </div>
  )
}
