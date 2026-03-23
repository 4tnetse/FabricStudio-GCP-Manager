import { useCostSummary } from '@/api/costs'
import { useSettings } from '@/api/settings'
import { Loader2, ExternalLink, AlertTriangle, Info } from 'lucide-react'

export default function Costs() {
  const { data, isLoading, error } = useCostSummary()
  const { data: settings } = useSettings()

  const projectId = settings?.active_project_id
  const billingConsoleUrl = `https://console.cloud.google.com/billing${projectId ? `?project=${projectId}` : ''}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Costs</h1>
        <p className="text-sm text-slate-400 mt-0.5">Billing overview for the active GCP project</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading billing data...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-5 text-sm text-red-400">
          Failed to load billing data: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {data?.billing_enabled === null && data.costs_error === 'permission_denied' && (
        <div className="rounded-xl border border-yellow-800 bg-yellow-900/10 p-5 space-y-2">
          <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Billing access not available
          </div>
          <p className="text-sm text-slate-400">
            The service account does not have permission to read billing data.
            You can view cost information directly in the{' '}
            <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
              GCP Billing Console
            </a>.
          </p>
        </div>
      )}

      {data?.billing_enabled === false && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-sm text-slate-400">
          Billing is not enabled for this project.
        </div>
      )}

      {data?.billing_enabled === true && (
        <>
          {/* Billing account card */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Billing Account</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Account name</p>
                <p className="text-slate-200">{data.display_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Account ID</p>
                <p className="text-slate-200 font-mono text-xs">{data.billing_account_id}</p>
              </div>
            </div>
            <a
              href={billingConsoleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline mt-1"
            >
              Open in GCP Billing Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Info note */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 flex items-start gap-3 text-sm text-slate-400">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
            <span>
              Detailed cost breakdowns are not available via the GCP Billing API.
              View your full cost report, including per-service and per-resource usage, in the{' '}
              <a href={billingConsoleUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                GCP Billing Console
              </a>.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
