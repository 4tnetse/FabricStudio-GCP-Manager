import { useState } from 'react'
import { ShieldCheck, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useProjectHealth, useEnableApi } from '@/api/settings'
import type { ProjectHealthGroup } from '@/lib/types'
import { cn } from '@/lib/utils'

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
}

export function ProjectHealthWidget({ hasKeys, projectId }: ProjectHealthWidgetProps) {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useProjectHealth(hasKeys, projectId)
  const enableApi = useEnableApi()
  const [enablingId, setEnablingId] = useState<string | null>(null)

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

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200 flex-1">Project Health</h2>
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
        <p className="text-xs text-red-400">{error instanceof Error ? error.message : 'Health check failed'}</p>
      ) : data ? (
        <>
          {/* Summary */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium',
            allOk ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-yellow-900/20 border border-yellow-800 text-yellow-300',
          )}>
            {allOk
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
            {allOk
              ? 'All permissions and APIs are configured correctly'
              : `${missingPerms > 0 ? `${missingPerms} permission${missingPerms > 1 ? 's' : ''} missing` : ''}${missingPerms > 0 && missingApis > 0 ? ' · ' : ''}${missingApis > 0 ? `${missingApis} API${missingApis > 1 ? 's' : ''} disabled` : ''}`}
          </div>

          {/* Permission groups */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Permissions</p>
            <div className="space-y-1">
              {data.permission_groups.map((group) => (
                <PermissionGroup key={group.name} group={group} />
              ))}
            </div>
          </div>

          {/* APIs */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">APIs</p>
            <div className="grid grid-cols-2 gap-1.5">
              {data.apis.map((api) => (
                <div
                  key={api.id}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs',
                    api.enabled
                      ? 'border-slate-700 bg-slate-800/40 text-slate-300'
                      : 'border-red-900 bg-red-900/20 text-red-300',
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
                      className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-800 disabled:opacity-40 shrink-0 transition-colors"
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
