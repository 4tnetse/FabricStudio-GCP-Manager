import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2, Download, Wifi, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useExecuteSsh, useTestSsh } from '@/api/ssh'
import { useInstances, usePublicIps } from '@/api/instances'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'

export default function SSH() {
  const [addresses, setAddresses] = useState('')
  const [command, setCommand] = useState('')
  const [mode, setMode] = useState<'parallel' | 'sequential'>('parallel')
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState<number | ''>('')

  const executeSsh = useExecuteSsh()
  const testSsh = useTestSsh()
  const { data: publicIps, isLoading: ipsLoading } = usePublicIps()
  const { data: instances = [], isLoading: instancesLoading } = useInstances()

  const withIp = useMemo(() => instances.filter((i) => i.public_ip), [instances])

  const filtered = useMemo(
    () => withIp.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [withIp, search],
  )

  function rebuildAddresses(next: Set<string>) {
    const ips = instances
      .filter((i) => next.has(i.name) && i.public_ip)
      .map((i) => i.public_ip as string)
    setAddresses(ips.join('\n'))
  }

  function toggleInstance(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      rebuildAddresses(next)
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      filtered.forEach((i) => next.add(i.name))
      rebuildAddresses(next)
      return next
    })
  }

  function clearSelection() {
    setSelectedNames(new Set())
    setAddresses('')
  }

  function applyRange() {
    if (!rangeFrom || rangeTo === '') {
      toast.error('Select a from instance and enter a to number')
      return
    }
    // Strip trailing -NNN to get base name and start number
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
    const ips = names
      .map((n) => instances.find((i) => i.name === n))
      .filter((i): i is NonNullable<typeof i> => !!i?.public_ip)
      .map((i) => i.public_ip as string)
    if (ips.length === 0) {
      toast.error('No instances with a public IP found in that range')
      return
    }
    setAddresses(ips.join('\n'))
    setSelectedNames(new Set())
    toast.success(`Selected ${ips.length} instance${ips.length !== 1 ? 's' : ''} from range`)
  }

  function handleLoadIps() {
    if (!publicIps?.instances?.length) {
      toast.error('No public IPs available')
      return
    }
    const ips = publicIps.instances.map((i) => i.public_ip).join('\n')
    setAddresses(ips)
    setSelectedNames(new Set())
    toast.success(`Loaded ${publicIps.instances.length} IPs`)
  }

  async function handleTest() {
    const lines = addresses.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      toast.error('Enter at least one IP address')
      return
    }
    setStreamUrl(null)
    try {
      const result = await testSsh.mutateAsync(lines)
      if (result.job_id) {
        setStreamUrl(`/api/ssh/${result.job_id}/stream`)
        toast.success(`Testing connection to ${lines.length} host${lines.length !== 1 ? 's' : ''}…`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    }
  }

  async function handleExecute() {
    const lines = addresses.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      toast.error('Enter at least one IP address')
      return
    }
    if (!command.trim()) {
      toast.error('Enter a command to execute')
      return
    }
    setStreamUrl(null)
    try {
      const result = await executeSsh.mutateAsync({ addresses: lines, command: command.trim(), mode })
      if (result.job_id) {
        setStreamUrl(`/api/ssh/${result.job_id}/stream`)
        toast.success(`SSH execution started on ${lines.length} host${lines.length !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SSH execution failed')
    }
  }

  const textareaClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500 resize-none'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  const addressCount = addresses.split('\n').filter((l) => l.trim()).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">SSH</h1>
        <p className="text-sm text-slate-400 mt-0.5">Execute commands on multiple instances via SSH</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5">

          {/* Addresses */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + ' mb-0'}>IP Addresses (one per line)</label>
              <button
                onClick={handleLoadIps}
                disabled={ipsLoading}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {ipsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Load all
              </button>
            </div>
            <textarea
              rows={5}
              className={textareaClass}
              placeholder="10.0.0.1&#10;10.0.0.2&#10;10.0.0.3"
              value={addresses}
              onChange={(e) => { setAddresses(e.target.value); setSelectedNames(new Set()) }}
            />
            <p className="text-xs text-slate-500 mt-1">
              {addressCount} address{addressCount !== 1 ? 'es' : ''}
            </p>
          </div>

          {/* Instance picker */}
          <div>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm hover:bg-slate-700 transition-colors"
            >
              <span className={selectedNames.size === 0 ? 'text-slate-500' : 'text-slate-200'}>
                {selectedNames.size === 0
                  ? 'Select instances by name…'
                  : `${selectedNames.size} of ${withIp.length} instance${withIp.length !== 1 ? 's' : ''} selected`}
              </span>
              {pickerOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {pickerOpen && (
              <div className="mt-1 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
                {/* Toolbar */}
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

                {/* Instance list */}
                <div className="max-h-48 overflow-y-auto">
                  {instancesLoading ? (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">No instances with a public IP</div>
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

                {/* Footer summary */}
                <div className="px-3 py-1.5 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
                  <span>{filtered.length} shown{search ? ` (filtered from ${withIp.length})` : ''}</span>
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
                    <CustomSelect
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={rangeFrom}
                      onChange={setRangeFrom}
                      options={[{ value: '', label: 'Select…' }, ...withIp.map((i) => ({ value: i.name, label: i.name }))]}
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

          {/* Command */}
          <div>
            <label className={labelClass}>Command</label>
            <textarea
              rows={4}
              className={textareaClass}
              placeholder="e.g. get system status"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
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
          </div>
        </div>

        {/* Right: Log output */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300">SSH output</h2>
          <LogStream url={streamUrl} minHeight="min-h-96" />
        </div>
      </div>
    </div>
  )
}
