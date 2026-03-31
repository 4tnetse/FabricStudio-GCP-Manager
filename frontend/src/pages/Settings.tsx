import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, Loader2, Trash2, Key, Settings2, Palette, Pencil, CalendarClock, Search, CheckCircle2, XCircle, AlertTriangle, Rocket, ChevronDown, ChevronUp } from 'lucide-react'
import { DocLink } from '@/components/DocLink'
import { useDetectCloudRunUrl } from '@/api/schedules'
import { useCloudRunPermissions, useCloudRunSubnets, useStartDeploy, useStartUndeploy, useDeployStream } from '@/api/cloudrun'
import { useSettings, useUpdateSettings, useResetSettings } from '@/api/settings'
import { useKeys, useUploadKey, useDeleteKey, useRenameKey } from '@/api/keys'
import { useZones, useZoneLocations } from '@/api/instances'
import { useSelectProject } from '@/api/projects'
import { useTheme, type AppTheme } from '@/context/ThemeContext'
import type { Settings, KeyInfo } from '@/lib/types'
import { CustomSelect } from '@/components/CustomSelect'
import { zoneLabel } from '@/lib/zones'
import { SwitchProjectDialog } from '@/components/SwitchProjectDialog'



function ErrorWithLink({ message }: { message: string }) {
  const urlMatch = message.match(/https?:\/\/\S+/)
  if (!urlMatch) return <>{message}</>
  const before = message.slice(0, urlMatch.index)
  const url = urlMatch[0]
  const after = message.slice((urlMatch.index ?? 0) + url.length)
  return <>{before}<a href={url} target="_blank" rel="noreferrer" className="underline hover:text-red-200">{url}</a>{after}</>
}

const THEMES: { value: AppTheme; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Dark slate theme (default)' },
  { value: 'light', label: 'Light', description: 'Light theme' },
  { value: 'security-fabric', label: 'Security Fabric', description: 'Fortinet Security Fabric style' },
]

function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const isSF = theme === 'security-fabric'
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Appearance</h2>
      </div>
      <div className="flex gap-3">
        {THEMES.map((t) => {
          const isActive = theme === t.value
          const activeStyle = isActive
            ? t.value === 'security-fabric'
              ? { borderColor: '#db291c', backgroundColor: 'rgba(219,41,28,0.1)', color: '#db291c' }
              : undefined
            : undefined
          return (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              style={activeStyle}
              className={`flex-1 flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-colors ${
                isActive
                  ? t.value === 'security-fabric'
                    ? ''
                    : 'border-blue-500 bg-blue-900/20 text-blue-300'
                  : 'border-slate-700 hover:border-slate-500 text-slate-300 hover:bg-slate-800/40'
              }`}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className={`text-xs mt-0.5 ${isActive && isSF ? 'text-[#db291c]/70' : 'text-slate-500'}`}>{t.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'
  const { data: settings, isLoading } = useSettings()
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()
  const updateSettings = useUpdateSettings()
  const resetSettings = useResetSettings()
  const { data: keys } = useKeys()
  const uploadKey = useUploadKey()
  const deleteKey = useDeleteKey()
  const renameKey = useRenameKey()
  const selectProject = useSelectProject()
  const queryClient = useQueryClient()
  const detectCloudRunUrl = useDetectCloudRunUrl()
  const startDeploy = useStartDeploy()
  const startUndeploy = useStartUndeploy()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<Settings>>({})
  const [confirmReset, setConfirmReset] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingKeyInfo, setPendingKeyInfo] = useState<KeyInfo | null>(null)

  // Cloud Run deploy state
  const [detectState, setDetectState] = useState<'idle' | 'detecting' | 'found' | 'not_found'>('idle')
  const [showDeployPanel, setShowDeployPanel] = useState(false)
  const [showManualUrl, setShowManualUrl] = useState(false)
  const [selectedSubnet, setSelectedSubnet] = useState('')
  const [deployStreamUrl, setDeployStreamUrl] = useState<string | null>(null)

  // Undeploy state
  const [showUndeployConfirm, setShowUndeployConfirm] = useState(false)
  const [undeployStreamUrl, setUndeployStreamUrl] = useState<string | null>(null)

  const region = (form.cloud_run_region as string) ?? ''
  const isConfigured = !!(form.remote_backend_url as string)

  const { data: permsData, isLoading: permsLoading, isError: permsError, error: permsErrorObj } = useCloudRunPermissions(showDeployPanel)
  const { data: subnets, isLoading: subnetsLoading, isError: subnetsError, error: subnetsErrorObj } = useCloudRunSubnets(region, showDeployPanel)
  const allPermsOk = permsData?.groups.every((g) => g.passed) ?? false

  const { lines: deployLines, isStreaming: deployStreaming, failed: deployFailed, error: deployError } =
    useDeployStream(deployStreamUrl, (url) => {
      setField('remote_backend_url', url as Settings['remote_backend_url'])
      setDetectState('found')
      toast.success('Cloud Run deployed successfully')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    })

  const { lines: undeployLines, isStreaming: undeployStreaming, failed: undeployFailed, error: undeployError } =
    useDeployStream(undeployStreamUrl, () => {})

  // When undeploy finishes successfully, refresh settings + version
  useEffect(() => {
    if (undeployStreamUrl && !undeployStreaming && !undeployFailed && undeployLines.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['version'] })
      toast.success('Cloud Run undeployed successfully')
    }
  }, [undeployStreamUrl, undeployStreaming, undeployFailed, undeployLines.length])

  useEffect(() => {
    if (settings) {
      setForm({
        initials: settings.initials ?? '',
        default_zone: settings.default_zone ?? '',
        default_type: settings.default_type ?? 'fs',
        owner: settings.owner ?? '',
        group: settings.group ?? '',
        ssh_public_key: settings.ssh_public_key ?? '',
        dns_domain: settings.dns_domain ?? '',
        instance_fqdn_prefix: settings.instance_fqdn_prefix ?? '',
        dns_zone_name: settings.dns_zone_name ?? '',
        fs_admin_password: settings.fs_admin_password ?? '',
        remote_scheduling_enabled: settings.remote_scheduling_enabled ?? false,
        remote_backend_url: settings.remote_backend_url ?? '',
        cloud_run_region: settings.cloud_run_region ?? '',
        firestore_project_id: settings.firestore_project_id ?? '',
      })
    }
  }, [settings])

  function setField<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const [isSavingPrefs, setIsSavingPrefs] = useState(false)
  const [isSavingScheduling, setIsSavingScheduling] = useState(false)

  async function handleSavePrefs() {
    setIsSavingPrefs(true)
    try {
      await updateSettings.mutateAsync({
        initials: form.initials,
        default_zone: form.default_zone,
        default_type: form.default_type,
        owner: form.owner,
        group: form.group,
        ssh_public_key: form.ssh_public_key,
        dns_domain: form.dns_domain,
        instance_fqdn_prefix: form.instance_fqdn_prefix,
        dns_zone_name: form.dns_zone_name,
        fs_admin_password: form.fs_admin_password,
      })
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSavingPrefs(false)
    }
  }

  async function handleDetect() {
    setDetectState('detecting')
    try {
      const result = await detectCloudRunUrl.mutateAsync()
      setField('remote_backend_url', result.url as Settings['remote_backend_url'])
      setField('cloud_run_region', result.region as Settings['cloud_run_region'])
      setDetectState('found')
      toast.success('Cloud Run detected')
    } catch {
      setDetectState('not_found')
    }
  }

  async function handleStartDeploy() {
    if (!selectedSubnet) {
      toast.error('Select a subnet first')
      return
    }
    try {
      const { deploy_id } = await startDeploy.mutateAsync({ region, subnet: selectedSubnet })
      setDeployStreamUrl(`/api/cloud-run/deploy/${deploy_id}/stream`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start deploy')
    }
  }

  async function handleStartUndeploy() {
    setShowUndeployConfirm(false)
    try {
      const { undeploy_id } = await startUndeploy.mutateAsync()
      setUndeployStreamUrl(`/api/cloud-run/undeploy/${undeploy_id}/stream`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start undeploy')
    }
  }

  async function handleSaveScheduling() {
    setIsSavingScheduling(true)
    try {
      await updateSettings.mutateAsync({
        remote_scheduling_enabled: form.remote_scheduling_enabled,
        remote_backend_url: form.remote_backend_url,
        cloud_run_region: form.cloud_run_region,
        firestore_project_id: form.firestore_project_id,
      })
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSavingScheduling(false)
    }
  }

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a JSON key file')
      return
    }
    const isFirstKey = !keys || keys.length === 0
    try {
      const meta = await uploadKey.mutateAsync(file)
      toast.success('Key file uploaded successfully')
      if (isFirstKey) {
        if (meta.projects.length > 0) {
          await selectProject.mutateAsync(meta.projects[0].id)
        }
      } else {
        setPendingKeyInfo(meta)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload key file')
    }
  }

  async function handleDeleteKey(keyId: string) {
    try {
      await deleteKey.mutateAsync(keyId)
      toast.success('Key removed')
    } catch {
      toast.error('Failed to remove key')
    }
  }

  async function handleRenameConfirm(keyId: string) {
    if (!editingName.trim()) return
    try {
      await renameKey.mutateAsync({ keyId, displayName: editingName.trim() })
    } catch {
      toast.error('Failed to rename key')
    }
    setEditingKeyId(null)
  }

  async function handleReset() {
    setConfirmReset(false)
    try {
      await resetSettings.mutateAsync()
      toast.success('Settings reset')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset settings')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const hasKey = !!(keys && keys.length > 0)

  const DNS_LABEL = '[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?'
  const DNS_DOMAIN_RE = new RegExp(`^${DNS_LABEL}(\\.${DNS_LABEL})*$`)
  const DNS_PREFIX_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/

  const dnsDomainError = form.dns_domain && !DNS_DOMAIN_RE.test(form.dns_domain as string)
    ? 'Invalid DNS domain (e.g. fs.fortilab.be)' : null
  const fqdnPrefixError = form.instance_fqdn_prefix && !DNS_PREFIX_RE.test(form.instance_fqdn_prefix as string)
    ? 'Invalid prefix — letters, numbers and hyphens only (e.g. lab)' : null

  const INSTANCE_PREFIX_RE = /^[a-z][a-z0-9-]*$/
  const instancePrefixValue = (form.default_type as string) ?? 'fs'
  const instancePrefixError = instancePrefixValue && !INSTANCE_PREFIX_RE.test(instancePrefixValue)
    ? 'Must start with a letter; only lowercase letters, digits and hyphens allowed'
    : instancePrefixValue.endsWith('-')
      ? 'Cannot end with a hyphen'
      : null

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const inputErrorClass =
    'w-full px-3 py-2 rounded-lg border border-red-500 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 placeholder:text-slate-500'
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Configure your GCP connection and preferences</p>
          <DocLink path="screens/settings/" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

      {/* Left column: Preferences */}
      {hasKey && <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Preferences</h2>
          {settings?.active_project_id && (
            <span className="ml-auto text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 font-mono truncate max-w-[180px]" title={settings.active_project_id}>
              {settings.active_project_id}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Default initials</label>
            <input
              className={inputClass}
              placeholder="e.g. tve"
              value={(form.initials as string) ?? ''}
              onChange={(e) => setField('initials', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Owner</label>
            <input
              className={inputClass}
              placeholder="e.g. tvermant"
              value={(form.owner as string) ?? ''}
              onChange={(e) => setField('owner', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Default zone</label>
            <CustomSelect
              className={inputClass}
              value={(form.default_zone as string) ?? ''}
              onChange={(v) => setField('default_zone', v)}
              options={zones.map((z) => ({ value: z, label: zoneLabel(z, zoneLocations) }))}
              searchable
            />
          </div>
          <div>
            <label className={labelClass}>Default instance prefix</label>
            <input
              className={instancePrefixError ? inputErrorClass : inputClass}
              placeholder="e.g. fs"
              value={instancePrefixValue}
              onChange={(e) => setField('default_type', e.target.value.toLowerCase())}
            />
            {instancePrefixError && <p className="text-xs text-red-400 mt-1">{instancePrefixError}</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>Default group</label>
          <input
            className={inputClass}
            placeholder="e.g. my-workshop-group"
            value={(form.group as string) ?? ''}
            onChange={(e) => setField('group', e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Default Fabric Studio admin password</label>
          <input
            className={inputClass}
            type="password"
            placeholder="Default password for Fabric Studio API access"
            value={(form.fs_admin_password as string) ?? ''}
            onChange={(e) => setField('fs_admin_password', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>DNS Domain</label>
            <input
              className={dnsDomainError ? inputErrorClass : inputClass}
              placeholder="e.g. fs.fortilab.be"
              value={(form.dns_domain as string) ?? ''}
              onChange={(e) => setField('dns_domain', e.target.value)}
            />
            {dnsDomainError && <p className="text-xs text-red-400 mt-1">{dnsDomainError}</p>}
          </div>
          <div>
            <label className={labelClass}>Instance FQDN prefix</label>
            <input
              className={fqdnPrefixError ? inputErrorClass : inputClass}
              placeholder="e.g. lab"
              value={(form.instance_fqdn_prefix as string) ?? ''}
              onChange={(e) => setField('instance_fqdn_prefix', e.target.value)}
            />
            {fqdnPrefixError && <p className="text-xs text-red-400 mt-1">{fqdnPrefixError}</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>DNS Zone name</label>
          <input
            className={inputClass}
            placeholder="e.g. fs-fortilab-be"
            value={(form.dns_zone_name as string) ?? ''}
            onChange={(e) => setField('dns_zone_name', e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">The managed zone name in Google Cloud DNS</p>
        </div>

        <div>
          <label className={labelClass}>SSH public key</label>
          <textarea
            rows={3}
            className={inputClass + ' resize-none font-mono text-xs'}
            placeholder="ssh-rsa AAAA..."
            value={(form.ssh_public_key as string) ?? ''}
            onChange={(e) => setField('ssh_public_key', e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-transparent hover:border-red-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset all settings
          </button>
          <button
            onClick={handleSavePrefs}
            disabled={isSavingPrefs || !!dnsDomainError || !!fqdnPrefixError || !!instancePrefixError}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isSavingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save settings
          </button>
        </div>
      </div>}{/* end Preferences widget */}

      {/* Right column: Keys + Appearance */}
      <div className="space-y-6">

      {/* Service Account Keys */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Service Account Keys</h2>
        </div>

        {/* Key list */}
        {keys && keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-start gap-3 px-3 py-3 rounded-lg bg-slate-800/60 border border-slate-700">
                <Key className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  {editingKeyId === key.id ? (
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        className="flex-1 px-2 py-0.5 rounded bg-slate-700 border border-slate-600 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConfirm(key.id)
                          if (e.key === 'Escape') setEditingKeyId(null)
                        }}
                        autoFocus
                      />
                      <button onClick={() => handleRenameConfirm(key.id)} className="text-xs text-blue-400 hover:text-blue-300 px-1">Save</button>
                      <button onClick={() => setEditingKeyId(null)} className="text-xs text-slate-500 hover:text-slate-300 px-1">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-slate-200 truncate">{key.display_name}</span>
                      <button
                        onClick={() => { setEditingKeyId(key.id); setEditingName(key.display_name) }}
                        className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {key.client_email && (
                    <div className="text-xs text-slate-500 truncate font-mono">{key.client_email}</div>
                  )}
                  <div className="text-xs text-slate-600 mt-0.5">
                    {key.projects.length === 0
                      ? 'No projects'
                      : key.projects.map((p) => p.name || p.id).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  title="Delete key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/40'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadKey.isPending ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-2" />
          ) : (
            <Upload className="w-6 h-6 text-slate-400 mb-2" />
          )}
          <p className="text-sm text-slate-300">
            {uploadKey.isPending ? 'Uploading...' : 'Drop JSON key file here or click to browse'}
          </p>
          <p className="text-xs text-slate-500 mt-1">GCP service account JSON key</p>
          <p className="text-xs text-slate-500 mt-2">GCP Console → IAM & Admin → Service Accounts → select account → Keys tab → Add Key → JSON</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileUpload(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>{/* end Service Account Keys widget */}

      {/* Appearance */}
      <ThemeSelector />

      {/* Scheduling */}
      {hasKey && <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Scheduling</h2>
          {settings?.active_project_id && (
            <span className="ml-auto text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 font-mono truncate max-w-[180px]" title={settings.active_project_id}>
              {settings.active_project_id}
            </span>
          )}
        </div>

        {/* Toggle */}
        <label className="flex items-center justify-between cursor-pointer select-none">
          <div>
            <span className="text-sm text-slate-300">Enable remote scheduling</span>
            <p className="text-xs text-slate-500 mt-0.5">Schedule Clone and Configure jobs via Cloud Run + Cloud Scheduler</p>
          </div>
          <div
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${form.remote_scheduling_enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
            onClick={async () => {
              const next = !form.remote_scheduling_enabled
              if (!next) {
                // Disabling — clear all scheduling settings and save immediately
                setForm(prev => ({
                  ...prev,
                  remote_scheduling_enabled: false,
                  remote_backend_url: '',
                  cloud_run_region: '',
                  firestore_project_id: '',
                }))
                setDetectState('idle')
                setShowDeployPanel(false)
                setDeployStreamUrl(null)
                setShowManualUrl(false)
                try {
                  await updateSettings.mutateAsync({
                    remote_scheduling_enabled: false,
                    remote_backend_url: '',
                    cloud_run_region: '',
                    firestore_project_id: '',
                  })
                } catch { /* ignore */ }
              } else {
                setField('remote_scheduling_enabled', true)
                if (!form.firestore_project_id && settings?.active_project_id) {
                  setField('firestore_project_id', settings.active_project_id)
                }
              }
            }}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.remote_scheduling_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </label>

        {form.remote_scheduling_enabled && (
          <div className="space-y-4 pt-1">

            {/* Region — always visible when enabled */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={labelClass}>Cloud Run region <span className="text-slate-600 font-normal">(required before deploying)</span></label>
                <CustomSelect
                  className={inputClass}
                  value={(form.cloud_run_region as string) ?? ''}
                  onChange={(v) => {
                    setField('cloud_run_region', v)
                    setDetectState('idle')
                  }}
                  options={(() => {
                    const allRegions = [...new Set(zones.map((z) => z.replace(/-[a-z]$/, '')))].sort()
                    const defaultRegion = ((form.default_zone as string) ?? '').replace(/-[a-z]$/, '')
                    const ordered = defaultRegion
                      ? [defaultRegion, ...allRegions.filter((r) => r !== defaultRegion)]
                      : allRegions
                    return ordered.map((r) => ({
                      value: r,
                      label: zoneLocations[r] ? `${r} (${zoneLocations[r]})` : r,
                    }))
                  })()}
                  searchable
                  placeholder="Select a region..."
                />
              </div>
              <button
                type="button"
                onClick={handleDetect}
                disabled={detectCloudRunUrl.isPending || detectState === 'detecting'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-600 hover:border-slate-400 disabled:opacity-50 text-sm text-slate-300 hover:text-slate-100 transition-colors shrink-0"
                title="Search all regions for an existing fabricstudio-scheduler Cloud Run service"
              >
                {detectState === 'detecting' || detectCloudRunUrl.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Search className="w-3.5 h-3.5" />}
                Detect
              </button>
            </div>

            {/* Configured state: URL is known */}
            {isConfigured && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-green-900/20 border border-green-800/40">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-400">Cloud Run configured</p>
                    <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{form.remote_backend_url as string}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUndeployConfirm(true)}
                    disabled={undeployStreaming || startUndeploy.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 border border-red-800/60 hover:border-red-600 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    Undeploy
                  </button>
                </div>

                {/* Undeploy log */}
                {undeployStreamUrl && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900">
                      {undeployStreaming
                        ? <><Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /><span className="text-xs text-slate-400">Undeploying...</span></>
                        : undeployFailed
                          ? <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-xs text-red-400">Undeploy failed</span></>
                          : <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">Completed</span></>}
                    </div>
                    <pre className="p-3 text-xs font-mono text-slate-300 overflow-auto max-h-48">
                      {undeployLines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                      {undeployError && <div className="text-red-400">{undeployError}</div>}
                    </pre>
                  </div>
                )}

                <div>
                  <label className={labelClass}>GCP Firestore Project ID</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. my-gcp-project"
                    value={(form.firestore_project_id as string) ?? ''}
                    onChange={(e) => setField('firestore_project_id', e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-1">GCP project that hosts Firestore. Defaults to the active project.</p>
                </div>

                {/* Option to clear and re-enter URL manually */}
                <button
                  type="button"
                  onClick={() => setField('remote_backend_url', '')}
                  className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
                >
                  Clear URL and re-detect / re-deploy
                </button>
              </div>
            )}

            {/* Unconfigured state: no URL yet */}
            {!isConfigured && (
              <div className="space-y-3">

                {/* Not found message */}
                {detectState === 'not_found' && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700">
                    <AlertTriangle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-300">
                      No <code className="font-mono text-slate-300">fabricstudio-scheduler</code> service found in any region.
                      You can deploy it below, or enter the URL manually.
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualUrl(!showManualUrl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-400 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showManualUrl ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Enter URL manually
                  </button>
                  <button
                    type="button"
                    disabled={!region}
                    onClick={() => {
                      setShowDeployPanel(!showDeployPanel)
                      setDeployStreamUrl(null)
                    }}
                    title={!region ? 'Select a region first' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isSF ? 'border-red-700 hover:border-red-500 text-red-400 hover:text-red-200' : 'border-blue-700 hover:border-blue-500 text-blue-400 hover:text-blue-200'}`}
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    {showDeployPanel ? 'Hide deploy panel' : 'Deploy to GCP'}
                  </button>
                </div>

                {/* Manual URL entry */}
                {showManualUrl && (
                  <div>
                    <label className={labelClass}>Remote Backend URL</label>
                    <input
                      className={inputClass}
                      placeholder="https://fabricstudio-scheduler-xxx-ew.a.run.app"
                      value={(form.remote_backend_url as string) ?? ''}
                      onChange={(e) => setField('remote_backend_url', e.target.value)}
                    />
                  </div>
                )}

                {/* Deploy panel */}
                {showDeployPanel && (
                  <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 p-4 space-y-4">
                    <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Deploy Cloud Run</p>

                    {/* Permissions check */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2">GCP permissions</p>
                      {permsLoading && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...
                        </div>
                      )}
                      {permsError && (
                        <p className="text-xs text-red-400"><ErrorWithLink message={permsErrorObj instanceof Error ? permsErrorObj.message : 'Failed to check permissions'} /></p>
                      )}
                      {permsData && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {permsData.groups.map((g) => (
                            <div key={g.name} className="flex items-start gap-1.5 text-xs">
                              {g.passed
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-px" />
                                : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-px" />}
                              <div>
                                <span className={g.passed ? 'text-slate-300' : 'text-red-400'}>{g.name}</span>
                                {!g.passed && g.message && (
                                  <p className="text-red-400/80 mt-0.5 leading-snug">{g.message}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {permsData && !allPermsOk && (
                        <p className="text-xs text-red-400 mt-1.5">
                          {permsData.groups.some(g => !g.passed && g.message)
                            ? 'Fix the issues above before deploying.'
                            : 'Missing permissions — the service account needs Owner or the specific roles above.'}
                        </p>
                      )}
                    </div>

                    {/* Subnet selector */}
                    {!deployStreamUrl && (
                      <div>
                        <label className={labelClass}>Subnet</label>
                        {subnetsLoading && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading subnets...
                          </div>
                        )}
                        {subnetsError && (
                          <p className="text-xs text-red-400"><ErrorWithLink message={subnetsErrorObj instanceof Error ? subnetsErrorObj.message : 'Failed to load subnets'} /></p>
                        )}
                        {subnets && subnets.length === 0 && (
                          <p className="text-xs text-slate-500">No subnets found in {region}.</p>
                        )}
                        {subnets && subnets.length > 0 && (
                          <select
                            className={inputClass}
                            value={selectedSubnet}
                            onChange={(e) => setSelectedSubnet(e.target.value)}
                          >
                            <option value="">Select subnet...</option>
                            {subnets.map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name} ({s.network} · {s.cidr})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {/* Start Deploy button */}
                    {!deployStreamUrl && (
                      <button
                        type="button"
                        onClick={handleStartDeploy}
                        disabled={startDeploy.isPending || !selectedSubnet || (permsData != null && !allPermsOk)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                        title={!allPermsOk && permsData ? 'Fix missing permissions first' : undefined}
                      >
                        {startDeploy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                        Start Deploy
                      </button>
                    )}

                  </div>
                )}

              </div>
            )}

            {/* Deploy log output — shown outside isConfigured block so it persists after deploy completes */}
            {deployStreamUrl && (
              <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900">
                  {deployStreaming
                    ? <><Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" /><span className="text-xs text-slate-400">Deploying...</span></>
                    : deployFailed
                      ? <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-xs text-red-400">Deploy failed</span></>
                      : <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">Completed</span></>}
                </div>
                <pre className="p-3 text-xs font-mono text-slate-300 overflow-auto max-h-48">
                  {deployLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                  {deployError && <div className="text-red-400">{deployError}</div>}
                </pre>
              </div>
            )}

          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSaveScheduling}
            disabled={isSavingScheduling}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isSavingScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save settings
          </button>
        </div>
      </div>}

      </div>{/* end right column */}

      </div>{/* end two-column grid */}


      {/* Reset confirmation dialog */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-red-900 bg-slate-900 shadow-2xl p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-2">Reset Settings</h2>
            <p className="text-sm text-slate-400 mb-4">
              This will remove all settings including the service account key. You will need to reconfigure everything.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undeploy confirmation dialog */}
      {showUndeployConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-red-900 bg-slate-900 shadow-2xl p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-2">Undeploy Cloud Run</h2>
            <p className="text-sm text-slate-400 mb-2">
              This will permanently remove:
            </p>
            <ul className="text-sm text-slate-400 list-disc list-inside space-y-1 mb-4">
              <li>All Cloud Scheduler jobs for Fabric Studio</li>
              <li>The <code className="font-mono text-slate-300">fabricstudio-scheduler</code> Cloud Run service</li>
              <li>The <code className="font-mono text-slate-300">fs-gcpbackend-to-instances</code> firewall rule</li>
              <li>The copied GCR Docker images</li>
              <li>All schedules and job run history from Firestore</li>
            </ul>
            <p className="text-sm text-slate-500 mb-4">Scheduling settings will be cleared. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUndeployConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleStartUndeploy}
                className="px-3 py-1.5 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white"
              >
                Undeploy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch project dialog after key upload */}
      {pendingKeyInfo && (
        <SwitchProjectDialog keyInfo={pendingKeyInfo} onClose={() => setPendingKeyInfo(null)} />
      )}
    </div>
  )
}
