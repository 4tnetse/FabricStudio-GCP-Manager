import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Upload, Loader2, Trash2, Key, Settings2, Palette } from 'lucide-react'
import { useSettings, useUpdateSettings, useUploadKeyFile, useDeleteKeyFile, useResetSettings } from '@/api/settings'
import { useTheme, type AppTheme } from '@/context/ThemeContext'
import type { Settings } from '@/lib/types'
import { CustomSelect } from '@/components/CustomSelect'

const ZONES = ['europe-west4-a', 'asia-southeast1-b', 'us-central1-c']
const TYPES = ['fs', 'fpoc']

const THEMES: { value: AppTheme; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Dark slate theme (default)' },
  { value: 'light', label: 'Light', description: 'Light theme' },
  { value: 'security-fabric', label: 'Security Fabric', description: 'Fortinet Security Fabric style' },
]

function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Appearance</h2>
      </div>
      <div className="flex gap-3">
        {THEMES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex-1 flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-colors ${
              theme === t.value
                ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                : 'border-slate-700 hover:border-slate-500 text-slate-300 hover:bg-slate-800/40'
            }`}
          >
            <span className="text-sm font-medium">{t.label}</span>
            <span className="text-xs text-slate-500 mt-0.5">{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const uploadKeyFile = useUploadKeyFile()
  const deleteKeyFile = useDeleteKeyFile()
  const resetSettings = useResetSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<Settings>>({})
  const [confirmReset, setConfirmReset] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({
        initials: settings.initials ?? '',
        default_zone: settings.default_zone ?? ZONES[0],
        default_type: settings.default_type ?? 'fs',
        owner: settings.owner ?? '',
        group: settings.group ?? '',
        ssh_public_key: settings.ssh_public_key ?? '',
        license_server: settings.license_server ?? '',
        dns_domain: settings.dns_domain ?? '',
        instance_fqdn_prefix: settings.instance_fqdn_prefix ?? '',
        dns_zone_name: settings.dns_zone_name ?? '',
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
      await uploadKeyFile.mutateAsync(file)
      toast.success('Key file uploaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload key file')
    }
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure your GCP connection and preferences</p>
      </div>

      {/* Service Account Key */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Service Account Key</h2>
        </div>

        {settings?.service_account_key_path && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/60 text-xs text-green-400">
            <Key className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-mono flex-1">{settings.service_account_key_path}</span>
            <button
              onClick={async () => {
                try {
                  await deleteKeyFile.mutateAsync()
                  toast.success('Key file removed')
                } catch {
                  toast.error('Failed to remove key file')
                }
              }}
              className="ml-1 text-green-600 hover:text-red-400 transition-colors shrink-0"
              title="Remove key file"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
            dragging
              ? 'border-blue-500 bg-blue-900/20'
              : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/40'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadKeyFile.isPending ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-2" />
          ) : (
            <Upload className="w-6 h-6 text-slate-400 mb-2" />
          )}
          <p className="text-sm text-slate-300">
            {uploadKeyFile.isPending ? 'Uploading...' : 'Drop JSON key file here or click to browse'}
          </p>
          <p className="text-xs text-slate-500 mt-1">GCP service account JSON key</p>
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
      </div>

      {/* Preferences */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">Preferences</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Initials</label>
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
              placeholder="e.g. John Doe"
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
              value={(form.default_zone as string) ?? ZONES[0]}
              onChange={(v) => setField('default_zone', v)}
              options={ZONES.map((z) => ({ value: z, label: z }))}
            />
          </div>
          <div>
            <label className={labelClass}>Default type</label>
            <CustomSelect
              className={inputClass}
              value={(form.default_type as string) ?? 'fs'}
              onChange={(v) => setField('default_type', v)}
              options={TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Group</label>
          <input
            className={inputClass}
            placeholder="e.g. my-workshop-group"
            value={(form.group as string) ?? ''}
            onChange={(e) => setField('group', e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>License server</label>
          <input
            className={inputClass}
            placeholder="e.g. 10.0.0.1"
            value={(form.license_server as string) ?? ''}
            onChange={(e) => setField('license_server', e.target.value)}
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
            disabled={updateSettings.isPending || !!dnsDomainError || !!fqdnPrefixError}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Save settings
          </button>
        </div>
      </div>

      {/* Theme */}
      <ThemeSelector />

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
    </div>
  )
}
