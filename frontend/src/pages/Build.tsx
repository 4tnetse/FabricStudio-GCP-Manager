import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Minus, Info, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useSettings } from '@/api/settings'
import { useZones, useMachineTypes, useZoneLocations } from '@/api/instances'
import { useImages } from '@/api/images'
import { zoneLabel } from '@/lib/zones'
import { LogStream } from '@/components/LogStream'
import { CustomSelect } from '@/components/CustomSelect'
import { DocLink } from '@/components/DocLink'
import { useBuild } from '@/context/BuildContext'

interface LabelPair {
  key: string
  value: string
}

export default function Build() {
  const { data: settings } = useSettings()
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()

  const [prepend, setPrepend] = useState(settings?.initials ?? '')
  const [product, setProduct] = useState('')
  const [zone, setZone] = useState(settings?.default_zone ?? '')
  const [machineType, setMachineType] = useState('')
  const [image, setImage] = useState('')
  const [diskSizeGb, setDiskSizeGb] = useState('200')
  const [group, setGroup] = useState(settings?.group ?? '')
  const [labels, setLabels] = useState<LabelPair[]>([])
  const [submitting, setSubmitting] = useState(false)

  const { data: machineTypes = [], isLoading: machineTypesLoading } = useMachineTypes(zone)
  const { data: images = [] } = useImages()

  const { buildJob, buildFormSnapshot, lines, isStreaming, handleStartBuild, handleDismiss } = useBuild()

  // Restore form values from snapshot when navigating back to an active/finished build
  useEffect(() => {
    if (buildJob && buildFormSnapshot) {
      setPrepend(buildFormSnapshot.prepend)
      setProduct(buildFormSnapshot.product)
      setZone(buildFormSnapshot.zone)
      setMachineType(buildFormSnapshot.machineType)
      setImage(buildFormSnapshot.image)
      setDiskSizeGb(buildFormSnapshot.diskSizeGb)
      setGroup(buildFormSnapshot.group)
      setLabels(buildFormSnapshot.labels)
    }
  }, []) // Only on mount — snapshot is stable while job is alive

  function handleDismissAndReset() {
    handleDismiss()
    setPrepend(settings?.initials ?? '')
    setProduct('')
    setZone(settings?.default_zone ?? '')
    setMachineType('')
    setImage('')
    setDiskSizeGb('200')
    setGroup(settings?.group ?? '')
    setLabels([])
  }

  const instanceName = `${settings?.default_type || '<prefix>'}-${prepend || '<initials>'}-${product || '<workshop>'}-000`
  const isActive = buildJob?.phase === 'building'

  function addLabel() {
    setLabels((prev) => [...prev, { key: '', value: '' }])
  }

  function removeLabel(i: number) {
    setLabels((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateLabel(i: number, field: 'key' | 'value', val: string) {
    setLabels((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))
  }

  const diskSizeNum = parseInt(diskSizeGb, 10)
  const diskSizeError = diskSizeGb !== '' && (isNaN(diskSizeNum) || diskSizeNum < 10 || diskSizeNum > 65536)

  async function handleBuild() {
    if (!prepend || !product || !zone || !image || !machineType) {
      const missing = [
        !prepend && 'Initials',
        !product && 'Workshop name',
        !zone && 'Zone',
        !image && 'Image',
        !machineType && 'Machine type',
      ].filter(Boolean).join(', ')
      toast.error(`Required fields missing: ${missing}`)
      return
    }
    if (diskSizeError) {
      toast.error('Disk size must be between 10 and 65536 GB')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        prepend,
        product,
        zone,
        machine_type: machineType,
        image: image || undefined,
        disk_size_gb: diskSizeGb !== '' && !diskSizeError ? diskSizeNum : undefined,
        labels: labels.reduce<Record<string, string>>((acc, { key, value }) => {
          if (key) acc[key] = value
          return acc
        }, { delete: 'no', ...(group ? { group } : {}) }),
      }
      await handleStartBuild(payload, instanceName, { prepend, product, zone, machineType, image, diskSizeGb, group, labels })
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  return (
    <div className="space-y-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Build</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Create your workshop golden image</p>
          <DocLink path="screens/build/" />
        </div>
      </div>

      {/* Status banner when a build is active (or just finished) and navigated back */}
      {buildJob && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-sm">
          {isActive ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          ) : buildJob.phase === 'done' ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="text-slate-300 truncate">
            {isActive && `Building '${buildJob.instanceName}'…`}
            {buildJob.phase === 'done' && `'${buildJob.instanceName}' built successfully.`}
            {buildJob.phase === 'failed' && `Build of '${buildJob.instanceName}' failed.`}
          </span>
          {!isActive && (
            <button onClick={handleDismissAndReset} className="text-slate-500 hover:text-slate-300 shrink-0 ml-auto">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: build form */}
        <div className={`space-y-4 rounded-xl border border-slate-700 bg-slate-800/30 p-5 ${isActive ? 'opacity-40 pointer-events-none' : ''}`}>
          <h2 className="text-sm font-semibold text-slate-200">Create golden image</h2>

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
            <label className={labelClass}>Disk size (GB)</label>
            <input
              className={`${inputClass}${diskSizeError ? ' border-red-500 focus:ring-red-500' : ''}`}
              type="number"
              min={10}
              max={65536}
              value={diskSizeGb}
              onChange={(e) => setDiskSizeGb(e.target.value)}
              placeholder="e.g. 200"
            />
            {diskSizeError && (
              <p className="mt-1 text-xs text-red-400">Must be between 10 and 65536</p>
            )}
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
            disabled={submitting || isActive}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {submitting || isActive ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building...
              </>
            ) : (
              'Build'
            )}
          </button>
        </div>

        {/* Right: log output */}
        <div className="relative">
          <div className="absolute inset-0 rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex flex-col gap-3 overflow-hidden">
            <h2 className="text-sm font-medium text-slate-300 shrink-0">Output</h2>
            <LogStream
              lines={lines}
              isStreaming={isStreaming}
              className="flex-1 min-h-0"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
