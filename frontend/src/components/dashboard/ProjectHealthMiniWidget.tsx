import { ShieldCheck, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettings, useProjectHealth } from '@/api/settings'
import { cn } from '@/lib/utils'

function Dot({ state }: { state: 'green' | 'red' | 'grey' }) {
  return (
    <span className={cn(
      'inline-block w-2.5 h-2.5 rounded-full shrink-0',
      state === 'green' ? 'bg-green-500' : state === 'red' ? 'bg-red-500' : 'bg-slate-600'
    )} />
  )
}

export function ProjectHealthMiniWidget() {
  const { data: settings } = useSettings()
  const hasKeys = !!settings?.has_keys
  const projectId = settings?.active_project_id

  const { data: health, isLoading } = useProjectHealth(hasKeys, projectId)

  const permissionGroupLabels = ['Instances', 'Images & Build', 'Network', 'DNS', 'Scheduling']

  const issueCount = health
    ? health.permission_groups.filter((g) => !g.passed).length + health.apis.filter((a) => !a.enabled).length
    : 0

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Project Health</h2>
      </div>

      {!hasKeys || !projectId ? (
        <div className="text-xs text-slate-500">Load a service account key to run the health check.</div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running checks…
        </div>
      ) : !health ? (
        <div className="text-xs text-slate-500">
          Run health check in Settings to see status.
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500 mb-1.5">Permissions</div>
            <div className="grid grid-cols-5 gap-1">
              {health.permission_groups.map((group, i) => (
                <div key={group.name} className="flex flex-col items-center gap-1">
                  <Dot state={group.passed ? 'green' : 'red'} />
                  <span className="text-slate-500 text-center w-full" style={{ fontSize: '9px', lineHeight: 1.2 }}>
                    {permissionGroupLabels[i] ?? group.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1.5">APIs</div>
            <div className="grid grid-cols-7 gap-1">
              {health.apis.map((api) => (
                <div key={api.id} className="flex flex-col items-center gap-1">
                  <Dot state={api.enabled ? 'green' : 'red'} />
                  <span className="text-slate-500 text-center w-full" style={{ fontSize: '9px', lineHeight: 1.2 }}>
                    {api.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('text-xs font-medium', issueCount === 0 ? 'text-green-400' : 'text-red-400')}>
            {issueCount === 0 ? 'All OK' : `${issueCount} issue${issueCount !== 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      <Link to="/settings" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Go to Settings →
      </Link>
    </div>
  )
}
