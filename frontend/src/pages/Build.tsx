import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Minus, ChevronDown, ChevronUp, Loader2, Info } from 'lucide-react'
import { apiPost } from '@/api/client'
import { useSettings } from '@/api/settings'
import { useInstances, useZones, useMachineTypes, useZoneLocations } from '@/api/instances'
import { useImages } from '@/api/images'
import { zoneLabel } from '@/lib/zones'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'

interface LabelPair {
  key: string
  value: string
}

export default function Build() {
  const { data: settings } = useSettings()
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()

  // Section 1: Create instance
  const [prepend, setPrepend] = useState(settings?.initials ?? '')
  const [product, setProduct] = useState('')
  const [zone, setZone] = useState(settings?.default_zone ?? '')
  const [machineType, setMachineType] = useState('')
  const [image, setImage] = useState('')
  const [group, setGroup] = useState(settings?.group ?? '')
  const [labels, setLabels] = useState<LabelPair[]>([])
  const [building, setBuilding] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [buildDone, setBuildDone] = useState(false)
  const [streamType, setStreamType] = useState<'build' | 'configure' | null>(null)

  // Section 2: Configure instance
  const [selectedGolden, setSelectedGolden] = useState('')
  const [oldAdminPassword, setOldAdminPassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [trialKey, setTrialKey] = useState('')
  const [licenseServer, setLicenseServer] = useState(settings?.license_server ?? '')
  const [pocLaunch, setPocLaunch] = useState('')
  const [pocDefs, setPocDefs] = useState<string[]>(Array(8).fill(''))
  const [pocDefsExpanded, setPocDefsExpanded] = useState(false)
  const [configuring, setConfiguring] = useState(false)

  // Shared log
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && streamType === 'build') {
      setBuildDone(true)
      if (prepend && product) setSelectedGolden(`fs-${prepend}-${product}-000`)
    }
    prevStreamingRef.current = streaming
  }, [streaming, streamType])

  const { data: instances = [] } = useInstances()
  const goldenInstances = instances.filter(i => i.name.endsWith('-000'))

  const { data: machineTypes = [], isLoading: machineTypesLoading } = useMachineTypes(zone)
  const { data: images = [] } = useImages()

  const instanceName = `fs-${prepend || '<initials>'}-${product || '<workshop>'}-000`

  function parseGoldenInstance(name: string) {
    const match = name.match(/^[^-]+-([^-]+)-(.+)-\d{3}$/)
    if (!match) return null
    return { prepend: match[1], product: match[2] }
  }

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
        labels: labels.reduce<Record<string, string>>((acc, { key, value }) => {
          if (key) acc[key] = value
          return acc
        }, { delete: 'no', ...(group ? { group } : {}) }),
      }
      const result = await apiPost<{ job_id: string }>('/ops/build', payload)
      setStreamType('build')
      setStreamUrl(`/api/ops/${result.job_id}/stream`)
      toast.success('Build started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  async function handleConfigure() {
    if (!selectedGolden) {
      toast.error('Select a golden image instance first')
      return
    }
    const parsed = parseGoldenInstance(selectedGolden)
    if (!parsed) {
      toast.error('Could not parse instance name')
      return
    }
    const goldenInstance = instances.find(i => i.name === selectedGolden)
    setConfiguring(true)
    setStreamUrl(null)
    try {
      const payload = {
        prepend: parsed.prepend,
        product: parsed.product,
        zone: goldenInstance?.zone ?? '',
        old_admin_password: oldAdminPassword || undefined,
        admin_password: adminPassword || undefined,
        trial_key: trialKey || undefined,
        license_server: licenseServer || undefined,
        poc_launch: pocLaunch || undefined,
        poc_definitions: pocDefs.filter(Boolean),
      }
      const result = await apiPost<{ job_id: string }>('/ops/configure', payload)
      setStreamType('configure')
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
        <h1 className="text-xl font-semibold text-slate-100">Build</h1>
        <p className="text-sm text-slate-400 mt-0.5">Create and configure your workshop golden image</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: two sections stacked */}
        <div className="space-y-6">

          {/* Section 1: Create instance */}
          <div className={`space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5 ${buildDone || streaming ? 'opacity-40 pointer-events-none' : ''}`}>
            <h2 className="text-sm font-semibold text-slate-200">1. Create golden image</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Prepend (your initials)</label>
                <input
                  className={inputClass}
                  value={prepend}
                  onChange={(e) => setPrepend(e.target.value.toLowerCase())}
                  placeholder="e.g. tve"
                />
              </div>
              <div>
                <label className={labelClass}>Workshop name</label>
                <input
                  className={inputClass}
                  value={product}
                  onChange={(e) => setProduct(e.target.value.toLowerCase())}
                  placeholder="e.g. partner-hol"
                />
              </div>
            </div>

            {(prepend || product) && (
              <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
                Instance name: <span className="font-mono text-slate-200">{instanceName}</span>
              </div>
            )}

            <div>
              <label className={labelClass}>Zone</label>
              <CustomSelect
                className={inputClass}
                value={zone}
                onChange={setZone}
                options={zones.map((z) => ({ value: z, label: zoneLabel(z, zoneLocations) }))}
                searchable
              />
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className={labelClass.replace(' mb-1', '')}>Machine type</label>
                <a href="https://cloud.google.com/products/compute/pricing" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
                  <Info className="w-3.5 h-3.5" />
                </a>
              </div>
              <CustomSelect
                className={inputClass}
                value={machineType}
                onChange={setMachineType}
                options={machineTypes.map((m) => ({ value: m, label: m }))}
                placeholder={!zone ? 'Select a zone first' : machineTypesLoading ? 'Loading...' : 'Select machine type'}
                searchable
              />
            </div>

            <div>
              <label className={labelClass}>Image</label>
              <CustomSelect
                className={inputClass}
                value={image}
                onChange={setImage}
                options={images.map((img) => ({ value: img.name, label: img.name }))}
                placeholder="Select an image"
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


            <button
              onClick={handleBuild}
              disabled={building || streaming}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {building || (streaming && streamType === 'build') ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building...
                </>
              ) : (
                'Build'
              )}
            </button>
          </div>

          {/* Section 2: Configure instance */}
          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5">
            <h2 className="text-sm font-semibold text-slate-200">2. Configure golden image</h2>
            <p className="text-xs text-slate-500 -mt-2">Make sure the instance is running before configuring.</p>

            <div>
              <label className={labelClass}>Golden image instance</label>
              <CustomSelect
                className={inputClass}
                value={selectedGolden}
                onChange={setSelectedGolden}
                options={goldenInstances.map(i => ({ value: i.name, label: i.name }))}
                placeholder="Select a golden image instance"
                searchable
              />
            </div>

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
              disabled={configuring || !selectedGolden}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {configuring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Configuring...
                </>
              ) : (
                'Configure'
              )}
            </button>
          </div>

        </div>

        {/* Right: Log output */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-slate-300 shrink-0">Output</h2>
          <LogStream url={streamUrl} minHeight="min-h-96" className="flex-1 min-h-0" onStreamingChange={setStreaming} />
        </div>
      </div>
    </div>
  )
}
