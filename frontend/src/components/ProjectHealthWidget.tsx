import { useState } from 'react'
import { ShieldCheck, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useProjectHealth, useEnableApi } from '@/api/settings'
import type { ProjectHealthGroup } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'

function PermissionGroup({ group }: { group: ProjectHealthGroup }) {
  const [open, setOpen] = useState(!group.passed)
  const missing = group.items.filter((i) => !i.granted).length

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-slate-800/60 hover:bg-slate-800 transition-colors text-left"
      >
        {group.passed
          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className="flex-1 text-xs font-medium text-slate-200">{group.name}</span>
        {!group.passed && (
          <span className="text-xs text-red-400 mr-1">{missing} missing</span>
        )}
        {open ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
      </button>
      {open && (
        <div className="divide-y divide-slate-700/50">
          {group.items.map((item) => (
            <div key={item.name} className="flex items-center gap-2 px-3 py-1.5">
              {item.granted
                ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
              <span className={cn('text-xs font-mono', item.granted ? 'text-slate-400' : 'text-red-300')}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ProjectHealthWidgetProps {
  hasKeys: boolean
  projectId?: string | null
  keyName?: string | null
}

export function ProjectHealthWidget({ hasKeys, projectId, keyName }: ProjectHealthWidgetProps) {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useProjectHealth(hasKeys, projectId)
  const enableApi = useEnableApi()
  const [enablingId, setEnablingId] = useState<string | null>(null)
  const [enablingAll, setEnablingAll] = useState(false)
  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'
  const enableBtnClass = isSF
    ? 'bg-[#db291c] hover:bg-[#c4241a] text-white'
    : 'bg-blue-600 hover:bg-blue-500 text-white'

  const allPermsPassed = data?.permission_groups.every((g) => g.passed) ?? false
  const allApisPassed = data?.apis.every((a) => a.enabled) ?? false
  const allOk = allPermsPassed && allApisPassed

  const missingPerms = data?.permission_groups.reduce((n, g) => n + g.items.filter((i) => !i.granted).length, 0) ?? 0
  const missingApis = data?.apis.filter((a) => !a.enabled).length ?? 0

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  async function handleEnableApi(apiId: string) {
    setEnablingId(apiId)
    try {
      await enableApi.mutateAsync(apiId)
      await refetch()
    } finally {
      setEnablingId(null)
    }
  }

  async function handleEnableAll() {
    if (!data) return
    const disabled = data.apis.filter((a) => !a.enabled)
    setEnablingAll(true)
    for (const api of disabled) {
      setEnablingId(api.id)
      try {
        await enableApi.mutateAsync(api.id)
      } catch {
        // continue with remaining APIs even if one fails
      }
    }
    setEnablingId(null)
    setEnablingAll(false)
    await refetch()
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Project Health</h2>
        {keyName && (
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 truncate max-w-[180px]" title={keyName}>
            {keyName}
          </span>
        )}
        <span className="flex-1" />
        {lastChecked && (
          <span className="text-xs text-slate-600">checked {lastChecked}</span>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching || !hasKeys || !projectId}
          title="Run health check"
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition-colors text-xs"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} />
          {data ? 'Refresh' : 'Run check'}
        </button>
      </div>

      {!hasKeys || !projectId ? (
        <p className="text-xs text-slate-500">Load a service account key to run the health check.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running checks…
        </div>
      ) : error ? (
        (error instanceof Error && error.message === 'serviceusage_disabled') ? (
          <div className="space-y-3">
            <p className="text-xs text-red-400">
              The <span className="font-medium">Service Usage API</span> must be enabled before the health check can run — it is used to check and enable all other APIs. Enable it manually in the GCP Console, then refresh.
            </p>
            <a
              href={`https://console.developers.google.com/apis/api/serviceusage.googleapis.com/overview?project=${projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${enableBtnClass}`}
            >
              Enable in GCP Console ↗
            </a>
          </div>
        ) : (error instanceof Error && error.message === 'crm_disabled') ? (
          <div className="space-y-3">
            <p className="text-xs text-red-400">
              The <span className="font-medium">Cloud Resource Manager API</span> must be enabled before the health check can run — it is used to verify permissions.
            </p>
            <button
              type="button"
              onClick={() => handleEnableApi('cloudresourcemanager.googleapis.com')}
              disabled={!!enablingId}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors ${enableBtnClass}`}
            >
              {enablingId === 'cloudresourcemanager.googleapis.com'
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Enabling…</>
                : 'Enable Cloud Resource Manager API'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-red-400">{error instanceof Error ? error.message : 'Health check failed'}</p>
        )
      ) : data ? (
        <>
          {/* Summary */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium',
            allOk ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-orange-600 text-white',
          )}>
            {allOk
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-white shrink-0" />}
            {allOk
              ? 'All permissions and APIs are configured correctly'
              : `${missingPerms > 0 ? `${missingPerms} permission${missingPerms > 1 ? 's' : ''} missing` : ''}${missingPerms > 0 && missingApis > 0 ? ' · ' : ''}${missingApis > 0 ? `${missingApis} API${missingApis > 1 ? 's' : ''} disabled` : ''}`}
          </div>

          {/* Permission groups */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 tracking-wide">Permissions</p>
            <div className="space-y-1">
              {data.permission_groups.map((group) => (
                <PermissionGroup key={group.name} group={group} />
              ))}
            </div>
          </div>

          {/* APIs */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-slate-500 tracking-wide flex-1">APIs</p>
              {data.apis.some((a) => !a.enabled) && (
                <button
                  type="button"
                  onClick={handleEnableAll}
                  disabled={enablingAll || !!enablingId}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium disabled:opacity-40 transition-colors ${enableBtnClass}`}
                >
                  {enablingAll
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Enabling…</>
                    : 'Enable all'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {data.apis.map((api) => (
                <div
                  key={api.id}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs',
                    api.enabled
                      ? 'border-slate-700 bg-slate-800/40 text-slate-300'
                      : 'border-slate-700 bg-slate-800/40 text-red-300',
                  )}
                >
                  {enablingId === api.id
                    ? <Loader2 className="w-3 h-3 animate-spin shrink-0 text-slate-400" />
                    : api.enabled
                      ? <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className="truncate flex-1">{api.name}</span>
                  {!api.enabled && enablingId !== api.id && (
                    <button
                      type="button"
                      onClick={() => handleEnableApi(api.id)}
                      disabled={!!enablingId}
                      className={`ml-1 px-1.5 py-0.5 rounded text-xs disabled:opacity-40 shrink-0 transition-colors ${enableBtnClass}`}
                    >
                      Enable
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">Click <span className="font-medium text-slate-400">Run check</span> to verify permissions and APIs for the active project.</p>
      )}
    </div>
  )
}
