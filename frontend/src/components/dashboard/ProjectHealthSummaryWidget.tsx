import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettings, useProjectHealth } from '@/api/settings'

export function ProjectHealthSummaryWidget() {
  const { data: settings } = useSettings()
  const hasKeys = !!settings?.has_keys
  const projectId = settings?.active_project_id

  const { data: health, isLoading } = useProjectHealth(hasKeys, projectId)

  const total = health
    ? health.permission_groups.length + health.apis.length
    : 0
  const passed = health
    ? health.permission_groups.filter((g) => g.passed).length + health.apis.filter((a) => a.enabled).length
    : 0
  const issueCount = total - passed
  const allOk = issueCount === 0 && total > 0

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
        <div className="text-xs text-slate-500">Run health check in Settings to see status.</div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-2">
          {allOk ? (
            <ShieldCheck className="w-10 h-10 text-green-500" />
          ) : (
            <ShieldAlert className="w-10 h-10 text-red-500" />
          )}
          <div className="text-center">
            <div className={`text-2xl font-bold ${allOk ? 'text-green-400' : 'text-red-400'}`}>
              {allOk ? 'All OK' : `${issueCount} issue${issueCount !== 1 ? 's' : ''}`}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{passed} of {total} checks passing</div>
          </div>
        </div>
      )}

      <Link to="/settings" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Go to Settings →
      </Link>
    </div>
  )
}
