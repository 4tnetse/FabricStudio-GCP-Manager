import { useState, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CalendarClock, Loader2, Download, Wifi, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useExecuteSsh, useTestSsh } from '@/api/ssh'
import { useInstances } from '@/api/instances'
import { useConfigs, useConfig } from '@/api/configs'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'
import { ScheduleDialog } from '@/components/ScheduleDialog'
import { useSettings } from '@/api/settings'
import { useTheme } from '@/context/ThemeContext'

function formatSelection(names: Set<string>): string {
  if (names.size === 0) return ''
  const arr = [...names].sort()
  if (arr.length === 1) return arr[0]
  const parseNum = (name: string) => {
    const m = name.match(/^(.+)-(\d+)$/)
    return m ? { base: m[1], num: parseInt(m[2]), pad: m[2].length } : null
  }
  const groups = new Map<string, { nums: number[]; pad: number }>()
  const singles: string[] = []
  for (const name of arr) {
    const p = parseNum(name)
    if (!p) { singles.push(name) } else {
      const g = groups.get(p.base)
      if (g) { g.nums.push(p.num) } else { groups.set(p.base, { nums: [p.num], pad: p.pad }) }
    }
  }
  const parts: string[] = []
  for (const [base, { nums, pad }] of groups) {
    nums.sort((a, b) => a - b)
    const runs: number[][] = []
    let run: number[] = [nums[0]]
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] + 1) { run.push(nums[i]) } else { runs.push(run); run = [nums[i]] }
    }
    runs.push(run)
    for (const r of runs) {
      const fmt = (n: number) => `${base}-${String(n).padStart(pad, '0')}`
      parts.push(r.length === 1 ? fmt(r[0]) : `${fmt(r[0])} to ${fmt(r[r.length - 1])}`)
    }
  }
  return [...parts, ...singles].join(', ')
}

function isInternalIp(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

function dedup(ips: string[]): string[] {
  return [...new Set(ips.filter(Boolean))]
}

function RangeFromCombobox({ value, onChange, instances }: { value: string; onChange: (v: string) => void; instances: { name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = (search ? instances.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())) : instances)
    .map((i) => i.name).sort()

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
        placeholder="e.g. fs-tve-fwb-000"
        value={open ? search : value}
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setSearch(value); setOpen(true) }}
        onBlur={() => { if (!open) setSearch('') }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-48 overflow-y-auto">
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

export default function SSH() {
  const [manualAddresses, setManualAddresses] = useState('')
  const [command, setCommand] = useState('')
  const [mode, setMode] = useState<'parallel' | 'sequential'>('parallel')
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState<number | ''>('')
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const { theme } = useTheme()
  const executeSsh = useExecuteSsh()
  const testSsh = useTestSsh()
  const { data: instances = [], isLoading: instancesLoading } = useInstances()
  const { data: configFiles = [] } = useConfigs()
  const { data: configDetail } = useConfig(selectedConfig || null)
  const { data: settings } = useSettings()

  const configCommands = configDetail
    ? configDetail.content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join('\n')
    : ''

  const filtered = useMemo(
    () => instances.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [instances, search],
  )

  // Resolve IPs for selected names: public first, internal as fallback (for execute/test)
  const selectedIps = useMemo(() => {
    return instances
      .filter((i) => selectedNames.has(i.name))
      .map((i) => (i.public_ip ?? i.internal_ip) as string)
      .filter(Boolean)
  }, [instances, selectedNames])

  // Resolve internal IPs only for selected names (for scheduling)
  const selectedInternalIps = useMemo(() => {
    return instances
      .filter((i) => selectedNames.has(i.name))
      .map((i) => i.internal_ip as string)
      .filter(Boolean)
  }, [instances, selectedNames])

  // Combined final address list: selected instance IPs + manual textarea IPs, deduped
  const allAddresses = useMemo(() => {
    const manual = manualAddresses.split('\n').map((l) => l.trim()).filter(Boolean)
    return dedup([...selectedIps, ...manual])
  }, [selectedIps, manualAddresses])

  // Address list for scheduling: internal IPs from selected instances + internal IPs from manual list
  const scheduleAddresses = useMemo(() => {
    const manualInternal = manualAddresses.split('\n').map((l) => l.trim()).filter((ip) => ip && isInternalIp(ip))
    return dedup([...selectedInternalIps, ...manualInternal])
  }, [selectedInternalIps, manualAddresses])

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
    setManualAddresses('')
  }

  function handleLoadExternalIps() {
    const ips = instances.map((i) => i.public_ip).filter(Boolean) as string[]
    if (!ips.length) { toast.error('No external IPs available'); return }
    setManualAddresses(ips.join('\n'))
    setSelectedNames(new Set())
    toast.success(`Loaded ${ips.length} external IP${ips.length !== 1 ? 's' : ''}`)
  }

  function handleLoadInternalIps() {
    const ips = instances.map((i) => i.internal_ip).filter(Boolean) as string[]
    if (!ips.length) { toast.error('No internal IPs available'); return }
    setManualAddresses(ips.join('\n'))
    setSelectedNames(new Set())
    toast.success(`Loaded ${ips.length} internal IP${ips.length !== 1 ? 's' : ''}`)
  }

  function applyRange() {
    if (!rangeFrom || rangeTo === '') {
      toast.error('Enter a from instance name and a to number')
      return
    }
    const match = rangeFrom.match(/^(.+)-(\d+)$/)
    if (!match) { toast.error('Could not parse instance name'); return }
    const base = match[1]
    const start = parseInt(match[2])
    const end = Number(rangeTo)
    if (end < start) { toast.error('"To" must be >= the from instance number'); return }
    const pad = (n: number) => String(n).padStart(match[2].length, '0')
    const names = Array.from({ length: end - start + 1 }, (_, i) => `${base}-${pad(start + i)}`)
    const next = new Set(names)
    setSelectedNames(next)
    toast.success(`Selected ${names.length} instance${names.length !== 1 ? 's' : ''} from range`)
  }

  async function handleTest() {
    if (allAddresses.length === 0) { toast.error('Select instances or enter at least one IP address'); return }
    setStreamUrl(null)
    try {
      const result = await testSsh.mutateAsync(allAddresses)
      if (result.job_id) {
        setStreamUrl(`/api/ssh/${result.job_id}/stream`)
        toast.success(`Testing connection to ${allAddresses.length} host${allAddresses.length !== 1 ? 's' : ''}…`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    }
  }

  async function handleExecute() {
    if (allAddresses.length === 0) { toast.error('Select instances or enter at least one IP address'); return }
    if (!selectedConfig && !command.trim()) { toast.error('Enter a command or select a configuration file'); return }
    setStreamUrl(null)
    try {
      const result = await executeSsh.mutateAsync({
        addresses: allAddresses,
        mode,
        ...(selectedConfig ? { configName: selectedConfig } : { command: command.trim() }),
      })
      if (result.job_id) {
        setStreamUrl(`/api/ssh/${result.job_id}/stream`)
        toast.success(`SSH execution started on ${allAddresses.length} host${allAddresses.length !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SSH execution failed')
    }
  }

  function handleSchedule() {
    const manualExternal = manualAddresses.split('\n').map((l) => l.trim()).filter((ip) => ip && !isInternalIp(ip))
    if (manualExternal.length > 0) {
      toast.warning(
        `${manualExternal.length} external IP${manualExternal.length !== 1 ? 's' : ''} in the manual list will be skipped — Cloud Run can only reach internal IPs`,
        { duration: 5000, icon: <AlertTriangle className="w-4 h-4 text-orange-400" /> }
      )
    }
    if (scheduleAddresses.length === 0) {
      toast.error('No internal IPs available — select instances with an internal IP or add internal IPs manually')
      return
    }
    setScheduleOpen(true)
  }

  const textareaClass = 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500 resize-none'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">SSH</h1>
        <p className="text-sm text-slate-400 mt-0.5">Execute commands on multiple instances via SSH</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5">

          {/* Instance picker */}
          <div>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm hover:bg-slate-700 transition-colors"
            >
              <span className={selectedNames.size === 0 ? 'text-slate-500' : 'text-slate-200'}>
                {selectedNames.size === 0
                  ? 'Select instances by name…'
                  : `${selectedNames.size} of ${instances.length} instance${instances.length !== 1 ? 's' : ''} selected`}
              </span>
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

          {/* Range select */}
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
                    <RangeFromCombobox value={rangeFrom} onChange={setRangeFrom} instances={instances} />
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
            <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-blue-900/20">
              <div className="text-xs text-blue-300 min-w-0">
                <span className="font-medium">{selectedNames.size} instance{selectedNames.size !== 1 ? 's' : ''} selected: </span>
                <span className="font-mono">{formatSelection(selectedNames)}</span>
              </div>
              <button onClick={clearSelection} className={`shrink-0 ${theme === 'security-fabric' ? 'text-[#db291c] hover:text-[#ff4433]' : 'text-blue-500 hover:text-blue-300'}`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* IP Addresses */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + ' mb-0'}>IP Addresses (one per line)</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleLoadInternalIps}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Download className="w-3 h-3" />
                  Load internal IPs
                </button>
                <button
                  onClick={handleLoadExternalIps}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Download className="w-3 h-3" />
                  Load external IPs
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              className={textareaClass}
              placeholder=""
              value={manualAddresses}
              onChange={(e) => { setManualAddresses(e.target.value); setSelectedNames(new Set()) }}
            />
            <p className="text-xs text-slate-500 mt-1">
              {allAddresses.length} address{allAddresses.length !== 1 ? 'es' : ''} total
              {selectedNames.size > 0 && manualAddresses.trim() && ' (instances + manual, deduplicated)'}
              {selectedNames.size > 0 && !manualAddresses.trim() && ` from ${selectedNames.size} selected instance${selectedNames.size !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Execution mode */}
          <div>
            <label className={labelClass}>Execution mode</label>
            <div className="flex gap-2">
              {(['parallel', 'sequential'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors capitalize ${
                    mode === m
                      ? 'border-blue-600 bg-blue-900/40 text-blue-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'parallel' ? 'All hosts run simultaneously' : 'Hosts run one at a time in order'}
            </p>
          </div>

          {/* Configuration file */}
          <div>
            <label className={labelClass}>Configuration file</label>
            <CustomSelect
              value={selectedConfig}
              onChange={setSelectedConfig}
              options={[
                { value: '', label: 'Manual (no config)' },
                ...configFiles.map((f) => ({ value: f.name, label: f.name })),
              ]}
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm"
            />
            {selectedConfig && (
              <p className="text-xs text-blue-400 mt-1">
                Commands from <span className="font-medium">{selectedConfig}</span> will be executed. Manual command is disabled.
              </p>
            )}
          </div>

          {/* Command */}
          <div>
            <label className={labelClass + (selectedConfig ? ' opacity-40' : '')}>Command</label>
            <textarea
              rows={4}
              className={textareaClass + (selectedConfig ? ' opacity-40 cursor-not-allowed' : '')}
              placeholder="e.g. get system status"
              value={selectedConfig ? configCommands : command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!!selectedConfig}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testSsh.isPending}
              className="flex-none py-2.5 px-4 rounded-lg border border-slate-600 hover:border-slate-400 disabled:opacity-50 text-slate-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {testSsh.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              Test auth
            </button>
            <button
              onClick={handleExecute}
              disabled={executeSsh.isPending}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {executeSsh.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Executing...</>
              ) : (
                'Execute'
              )}
            </button>
            <button
              onClick={handleSchedule}
              disabled={allAddresses.length === 0}
              title="Schedule this SSH job (internal IPs only)"
              className="px-3 py-2.5 rounded-lg border border-slate-600 hover:border-slate-400 disabled:opacity-50 text-slate-300 hover:text-slate-100 flex items-center gap-1.5 text-sm transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              Schedule
            </button>
          </div>
        </div>

        {/* Right: Log output */}
        <div className="relative">
          <div className="absolute inset-0 rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3 overflow-hidden">
            <h2 className="text-sm font-medium text-slate-300 shrink-0">SSH output</h2>
            <LogStream url={streamUrl} className="flex-1 min-h-0" />
          </div>
        </div>
      </div>

      {scheduleOpen && (
        <ScheduleDialog
          jobType="ssh"
          projectId={settings?.active_project_id ?? undefined}
          payload={{
            addresses: scheduleAddresses,
            commands: selectedConfig ? configCommands.split('\n').map((l) => l.trim()).filter(Boolean) : command.trim().split('\n').map((l) => l.trim()).filter(Boolean),
            config_name: selectedConfig || undefined,
            parallel: mode === 'parallel',
          }}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  )
}
