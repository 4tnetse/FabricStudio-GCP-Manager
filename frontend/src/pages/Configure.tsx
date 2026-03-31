import { useState, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Info, Loader2, Plus, Search, X } from 'lucide-react'
import { apiGet, apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { useTheme } from '@/context/ThemeContext'
import { useInstances } from '@/api/instances'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'
import { ScheduleDialog } from '@/components/ScheduleDialog'
import { useOps } from '@/context/OpsContext'
import { DocLink } from '@/components/DocLink'

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

function formatSelection(names: Set<string>): string {
  if (names.size === 0) return ''
  const arr = [...names].sort()
  if (arr.length === 1) return arr[0]

  const parseNum = (name: string) => {
    const m = name.match(/^(.+)-(\d+)$/)
    return m ? { base: m[1], num: parseInt(m[2]), pad: m[2].length } : null
  }

  // Group by base name; unparseable names kept as-is
  const groups = new Map<string, { nums: number[]; pad: number }>()
  const singles: string[] = []

  for (const name of arr) {
    const p = parseNum(name)
    if (!p) {
      singles.push(name)
    } else {
      const g = groups.get(p.base)
      if (g) {
        g.nums.push(p.num)
      } else {
        groups.set(p.base, { nums: [p.num], pad: p.pad })
      }
    }
  }

  const parts: string[] = []
  for (const [base, { nums, pad }] of groups) {
    nums.sort((a, b) => a - b)
    // Split into contiguous runs
    const runs: number[][] = []
    let run: number[] = [nums[0]]
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] + 1) {
        run.push(nums[i])
      } else {
        runs.push(run)
        run = [nums[i]]
      }
    }
    runs.push(run)

    for (const r of runs) {
      const fmt = (n: number) => `${base}-${String(n).padStart(pad, '0')}`
      parts.push(r.length === 1 ? fmt(r[0]) : `${fmt(r[0])} to ${fmt(r[r.length - 1])}`)
    }
  }

  return [...parts, ...singles].join(', ')
}

export default function Configure() {
  const { data: settings } = useSettings()
  const { theme } = useTheme()
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
  const [guestPassword, setGuestPassword] = useState('')
  const [hostnameTemplate, setHostnameTemplate] = useState('')
  const [sshKeys, setSshKeys] = useState<string[]>([])
  const [deleteExistingKeys, setDeleteExistingKeys] = useState(false)
  const [trialKey, setTrialKey] = useState('')
  const trialKeyError = trialKey !== '' && !/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}:[a-z0-9]{15}$/.test(trialKey)

  const passwordComplexity = (pw: string) =>
    [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length >= 3

  const adminPasswordError = adminPassword !== '' && !passwordComplexity(adminPassword)
  const guestPasswordError = guestPassword !== '' && !passwordComplexity(guestPassword)

  const SSH_KEY_RE = /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-dss) [A-Za-z0-9+/]+=*/
  const sshKeyErrors = sshKeys.map(key => key !== '' && !SSH_KEY_RE.test(key))
  const hasSshKeyError = sshKeyErrors.some(Boolean)
  const [licenseServerInstance, setLicenseServerInstance] = useState('')
  const licenseServerIp = licenseServerInstance
    ? (instances.find((i) => i.name === licenseServerInstance)?.internal_ip ?? '')
    : ''
  const [workspaceSource, setWorkspaceSource] = useState('')
  const [workspaceTemplates, setWorkspaceTemplates] = useState<{ id: number; name: string; description: string }[]>([])
  const [workspaceTemplatesLoading, setWorkspaceTemplatesLoading] = useState(false)
  const [workspaceFabrics, setWorkspaceFabrics] = useState<{ name: string; templateId: string }[]>([])
  const [workspaceInstallIndex, setWorkspaceInstallIndex] = useState<number>(-1) // -1 = None
  const [deleteAllWorkspaces, setDeleteAllWorkspaces] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const { configure: configureOps, setConfigureStreamUrl, configureJob, startConfigureJob, dismissConfigureJob } = useOps()

  useEffect(() => {
    if (!workspaceSource) {
      setWorkspaceTemplates([])
      setWorkspaceFabrics([])
      setWorkspaceInstallIndex(-1)
      setDeleteAllWorkspaces(false)
      return
    }
    setWorkspaceTemplatesLoading(true)
    setWorkspaceTemplates([])
    setWorkspaceFabrics([])
    setWorkspaceInstallIndex(-1)
    setDeleteAllWorkspaces(false)
    const sourceInst = instances.find((i) => i.name === workspaceSource)
    apiGet<{ templates: { id: number; name: string; description: string }[] }>(
      '/ops/fs-templates',
      { instance_name: workspaceSource, zone: sourceInst?.zone ?? settings?.default_zone ?? '' },
    )
      .then((data) => setWorkspaceTemplates(data.templates))
      .catch((err) => toast.error(err.message ?? 'Failed to fetch templates'))
      .finally(() => setWorkspaceTemplatesLoading(false))
  }, [workspaceSource])

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
      toast.error('Enter a from instance name and a to number')
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
    setSelectedNames(new Set(names))
    toast.success(`Selected ${names.length} instance${names.length !== 1 ? 's' : ''} from range`)
  }

  function addSshKey() {
    setSshKeys((prev) => [...prev, ''])
  }

  function updateSshKey(i: number, val: string) {
    setSshKeys((prev) => prev.map((v, idx) => (idx === i ? val : v)))
  }

  function removeSshKey(i: number) {
    setSshKeys((prev) => prev.filter((_, idx) => idx !== i))
  }

  const hasValidFabrics = workspaceFabrics.some(f => f.name && f.templateId)

  async function handleConfigure() {
    if (selectedNames.size === 0) {
      toast.error('Select at least one instance')
      return
    }
    const items = [...selectedNames].map((name) => {
      const inst = instances.find((i) => i.name === name)
      return { name, zone: inst?.zone ?? settings?.default_zone ?? '' }
    })
    setConfiguring(true)
    try {
      const isNewLicenseServer = licenseServerInstance === '__new_license_server__'
      const payload = {
        instances: items,
        old_admin_password: oldAdminPassword || undefined,
        admin_password: adminPassword || undefined,
        guest_password: guestPassword || undefined,
        trial_key: trialKey || undefined,
        license_server: (!isNewLicenseServer && licenseServerIp) ? licenseServerIp : undefined,
        hostname_template: hostnameTemplate || undefined,
        delete_all_workspaces: hasValidFabrics || deleteAllWorkspaces,
        workspace_fabrics: workspaceFabrics.filter(f => f.name && f.templateId).map((f, i) => ({ name: f.name, template_name: workspaceTemplates.find(t => String(t.id) === f.templateId)?.name ?? '', install: i === workspaceInstallIndex })),
        ssh_keys: sshKeys.filter(Boolean),
        delete_existing_keys: deleteExistingKeys,
        convert_to_license_server: isNewLicenseServer || undefined,
      }
      const result = await apiPost<{ job_id: string }>('/ops/bulk-configure', payload)
      setConfigureStreamUrl(`/api/ops/${result.job_id}/stream`)
      startConfigureJob(`Configuring ${items.length} instance${items.length !== 1 ? 's' : ''}…`)
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
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Configure</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Configure Fabric Studio instances</p>
          <DocLink path="screens/configure/" />
        </div>
      </div>

      {configureJob && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-sm">
          {configureJob.phase === 'running' ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          ) : configureJob.phase === 'done' ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="text-slate-300 truncate">
            {configureJob.phase === 'running' && configureJob.label}
            {configureJob.phase === 'done' && 'Configure completed successfully.'}
            {configureJob.phase === 'failed' && 'Configure failed — check output for details.'}
          </span>
          {configureJob.phase !== 'running' && (
            <button onClick={dismissConfigureJob} className="text-slate-500 hover:text-slate-300 shrink-0 ml-auto">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: one widget with two sections */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30">

          {/* Section 1: Instance selection */}
          <div className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Select instances</h2>

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
          </div>

          {/* Section 2: Configuration */}
          <div className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Configure</h2>
            <p className="text-xs text-slate-500 -mt-2">Make sure the selected instances are running.</p>

            <div className="grid grid-cols-2 gap-3">
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
                  className={`${inputClass}${adminPasswordError ? ' border-red-500 focus:ring-red-500' : ''}`}
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Optional"
                />
                {adminPasswordError && (
                  <p className="text-red-400 text-xs mt-1">Must contain at least 3 of: uppercase, lowercase, digit, special character.</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs font-medium text-slate-400">Fabric Studio Registration token:secret</label>
                <a href="https://srv3.register.fortipoc.com/" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300">
                  <Info className="w-3.5 h-3.5" />
                </a>
              </div>
              <input
                className={`${inputClass}${trialKeyError ? ' border-red-500 focus:ring-red-500' : ''}`}
                value={trialKey}
                onChange={(e) => setTrialKey(e.target.value)}
                placeholder="Optional"
              />
              {trialKeyError && (
                <p className="text-red-400 text-xs mt-1">Format: <span className="font-mono">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxxxxxxxxx</span></p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + ' mb-0'}>SSH public keys</label>
                <button
                  type="button"
                  onClick={addSshKey}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Plus className="w-3 h-3" />
                  Add key
                </button>
              </div>
              <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteExistingKeys}
                  onChange={(e) => setDeleteExistingKeys(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
                />
                <span className="text-xs text-slate-400">Delete existing keys before adding</span>
              </label>
              {settings?.ssh_public_key && (
                <p className="text-xs text-slate-500 mb-2">The SSH key from Settings is always installed.</p>
              )}
              {sshKeys.length === 0 && !settings?.ssh_public_key && (
                <p className="text-xs text-slate-500 mb-1">No SSH key configured in Settings. Add keys below.</p>
              )}
              <div className="space-y-2">
                {sshKeys.map((key, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputClass} font-mono text-xs${sshKeyErrors[i] ? ' border-red-500 focus:ring-red-500' : ''}`}
                        value={key}
                        onChange={(e) => updateSshKey(i, e.target.value)}
                        placeholder="ssh-rsa AAAA…"
                      />
                      <button
                        type="button"
                        onClick={() => removeSshKey(i)}
                        className="shrink-0 text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {sshKeyErrors[i] && (
                      <p className="text-red-400 text-xs mt-1">Must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-nistp…</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Fabric Studio License Server</label>
              <CustomSelect
                className={inputClass}
                value={licenseServerInstance}
                onChange={setLicenseServerInstance}
                options={[
                  { value: '', label: 'None' },
                  { value: '__new_license_server__', label: 'This will be a new license server' },
                  ...instances.map((i) => ({ value: i.name, label: i.name })),
                ]}
                searchable
              />
            </div>

            <div>
              <label className={labelClass}>Set guest password</label>
              <input
                className={`${inputClass}${guestPasswordError ? ' border-red-500 focus:ring-red-500' : ''}`}
                type="password"
                value={guestPassword}
                onChange={(e) => setGuestPassword(e.target.value)}
                placeholder="Optional"
              />
              {guestPasswordError
                ? <p className="text-red-400 text-xs mt-1">Must contain at least 3 of: uppercase, lowercase, digit, special character.</p>
                : <p className="text-xs text-slate-500 mt-1">Must meet policy: at least 3 of uppercase, lowercase, digit, special character.</p>
              }
            </div>

            <div>
              <label className={labelClass}>Hostname</label>
              <input
                className={inputClass}
                value={hostnameTemplate}
                onChange={(e) => setHostnameTemplate(e.target.value)}
                placeholder="e.g. Attendee - {count}"
              />
              <p className="text-xs text-slate-500 mt-1"><code className="text-slate-500">{'{count}'}</code> is replaced with the instance number (e.g. 1, 23)</p>
            </div>

            {/* Fabric Workspace */}
            <div className="pt-2 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Fabric Workspace</h2>

              <div>
                <label className={labelClass}>Source instance (make sure the instance is running and registered)</label>
                <CustomSelect
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={workspaceSource}
                  onChange={setWorkspaceSource}
                  options={[
                    { value: '', label: 'Select instance…' },
                    ...instances.map((i) => ({ value: i.name, label: i.name })),
                  ]}
                  searchable
                />
              </div>

              {workspaceSource && (
                <div className="space-y-2">
                  <label className={`flex items-center gap-2 cursor-pointer select-none ${hasValidFabrics ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={hasValidFabrics || deleteAllWorkspaces}
                      disabled={hasValidFabrics}
                      onChange={(e) => setDeleteAllWorkspaces(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0"
                    />
                    <span className="text-xs text-slate-400">Delete all workspaces</span>
                  </label>

                  {workspaceFabrics.length > 0 && <>
                  {/* Install label row (above radio column) */}
                  <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 3rem 3rem' }}>
                    <span />
                    <span />
                    <div className="flex justify-center">
                      <span className={labelClass + ' mb-0'}>Install</span>
                    </div>
                    <span />
                  </div>

                  {/* Name / Template / None row */}
                  <div className="grid gap-3 items-center -mt-1" style={{ gridTemplateColumns: '1fr 1fr 3rem 3rem' }}>
                    <span className={labelClass + ' mb-0'}>Name</span>
                    <span className={labelClass + ' mb-0'}>Template</span>
                    <div className="flex justify-center">
                      <input
                        type="radio"
                        name="workspace-install"
                        checked={workspaceInstallIndex === -1}
                        onChange={() => setWorkspaceInstallIndex(-1)}
                        className="accent-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-center">
                      <span className="text-xs text-slate-400 italic">None</span>
                    </div>
                  </div>

                  {/* Fabric rows */}
                  {workspaceFabrics.map((fabric, i) => (
                    <div key={i} className="grid gap-3 items-center" style={{ gridTemplateColumns: '1fr 1fr 3rem 3rem' }}>
                      <input
                        className={inputClass}
                        value={fabric.name}
                        onChange={(e) => setWorkspaceFabrics(prev => prev.map((f, idx) => idx === i ? { ...f, name: e.target.value } : f))}
                        placeholder="e.g. My Workshop"
                      />
                      <CustomSelect
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={fabric.templateId}
                        onChange={(val) => setWorkspaceFabrics(prev => prev.map((f, idx) => idx === i ? { ...f, templateId: val } : f))}
                        disabled={workspaceTemplatesLoading || workspaceTemplates.length === 0}
                        options={[
                          { value: '', label: workspaceTemplatesLoading ? 'Loading…' : workspaceTemplates.length === 0 ? 'No templates' : 'Select…' },
                          ...workspaceTemplates.map((t) => ({ value: String(t.id), label: t.name || t.description || `Template ${t.id}` })),
                        ]}
                        searchable
                      />
                      <div className="flex justify-center">
                        <input
                          type="radio"
                          name="workspace-install"
                          checked={workspaceInstallIndex === i}
                          onChange={() => setWorkspaceInstallIndex(i)}
                          className="accent-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </div>
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setWorkspaceFabrics(prev => prev.filter((_, idx) => idx !== i))
                            if (workspaceInstallIndex === i) setWorkspaceInstallIndex(-1)
                            else if (workspaceInstallIndex > i) setWorkspaceInstallIndex(workspaceInstallIndex - 1)
                          }}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  </>}

                  <button
                    type="button"
                    onClick={() => setWorkspaceFabrics(prev => [...prev, { name: '', templateId: '' }])}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 pt-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Fabric
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
            <button
              onClick={handleConfigure}
              disabled={configuring || configureOps.isStreaming || selectedNames.size === 0 || trialKeyError || adminPasswordError || guestPasswordError || hasSshKeyError}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {configuring || configureOps.isStreaming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Configuring...
                </>
              ) : (
                `Configure${selectedNames.size > 0 ? ` (${selectedNames.size})` : ''}`
              )}
            </button>
            <button
              onClick={() => setScheduleOpen(true)}
              disabled={selectedNames.size === 0 || trialKeyError || adminPasswordError || guestPasswordError || hasSshKeyError}
              title="Schedule this configure job"
              className="px-3 py-2.5 rounded-lg border border-slate-600 hover:border-slate-400 disabled:opacity-50 text-slate-300 hover:text-slate-100 flex items-center gap-1.5 text-sm transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              Schedule
            </button>
            </div>
          </div>

        </div>{/* end left widget */}

        {/* Right: log output — relative wrapper so absolute child doesn't inflate grid row */}
        <div className="relative">
          <div className="absolute inset-0 rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3 overflow-hidden">
            <h2 className="text-sm font-medium text-slate-300 shrink-0">Output</h2>
            <LogStream lines={configureOps.lines} isStreaming={configureOps.isStreaming} className="flex-1 min-h-0" />
          </div>
        </div>
      </div>

      {scheduleOpen && (
        <ScheduleDialog
          jobType="configure"
          projectId={settings?.active_project_id ?? undefined}
          payload={{
            instances: [...selectedNames].map((name) => {
              const inst = instances.find((i) => i.name === name)
              return { name, zone: inst?.zone ?? settings?.default_zone ?? '' }
            }),
            old_admin_password: oldAdminPassword || settings?.fs_admin_password || undefined,
            admin_password: adminPassword || undefined,
            guest_password: guestPassword || undefined,
            trial_key: trialKey || undefined,
            license_server: (licenseServerInstance !== '__new_license_server__' && licenseServerIp) ? licenseServerIp : undefined,
            hostname_template: hostnameTemplate || undefined,
            delete_all_workspaces: hasValidFabrics || deleteAllWorkspaces,
            workspace_fabrics: workspaceFabrics.filter(f => f.name && f.templateId).map((f, i) => ({ name: f.name, template_name: workspaceTemplates.find(t => String(t.id) === f.templateId)?.name ?? '', install: i === workspaceInstallIndex })),
            ssh_keys: sshKeys.filter(Boolean),
            delete_existing_keys: deleteExistingKeys,
            convert_to_license_server: licenseServerInstance === '__new_license_server__' || undefined,
          }}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  )
}
