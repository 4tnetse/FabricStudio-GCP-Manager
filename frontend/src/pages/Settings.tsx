import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Upload, Loader2, Trash2, Key, Settings2, Palette, Pencil } from 'lucide-react'
import { useSettings, useUpdateSettings, useResetSettings } from '@/api/settings'
import { useKeys, useUploadKey, useDeleteKey, useRenameKey } from '@/api/keys'
import { useZones, useZoneLocations } from '@/api/instances'
import { useTheme, type AppTheme } from '@/context/ThemeContext'
import type { Settings, KeyInfo } from '@/lib/types'
import { CustomSelect } from '@/components/CustomSelect'
import { zoneLabel } from '@/lib/zones'
import { SwitchProjectDialog } from '@/components/SwitchProjectDialog'


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
  const { data: settings, isLoading } = useSettings()
  const { data: zones = [] } = useZones()
  const { data: zoneLocations = {} } = useZoneLocations()
  const updateSettings = useUpdateSettings()
  const resetSettings = useResetSettings()
  const { data: keys } = useKeys()
  const uploadKey = useUploadKey()
  const deleteKey = useDeleteKey()
  const renameKey = useRenameKey()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<Settings>>({})
  const [confirmReset, setConfirmReset] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingKeyInfo, setPendingKeyInfo] = useState<KeyInfo | null>(null)

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
      })
    }
  }, [settings])

  function setField<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    try {
      await updateSettings.mutateAsync(form)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a JSON key file')
      return
    }
    try {
      const meta = await uploadKey.mutateAsync(file)
      toast.success('Key file uploaded successfully')
      setPendingKeyInfo(meta)
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
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure your GCP connection and preferences</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

      {/* Left column: Preferences */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Preferences</h2>
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
            onClick={handleSave}
            disabled={updateSettings.isPending || !!dnsDomainError || !!fqdnPrefixError || !!instancePrefixError}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Save settings
          </button>
        </div>
      </div>{/* end Preferences widget */}

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

      {/* Switch project dialog after key upload */}
      {pendingKeyInfo && (
        <SwitchProjectDialog keyInfo={pendingKeyInfo} onClose={() => setPendingKeyInfo(null)} />
      )}
    </div>
  )
}
