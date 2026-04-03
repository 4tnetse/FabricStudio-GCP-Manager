import { useCostSummary, useInstanceCosts, useWorkshopCosts, useProjectedCosts } from '@/api/costs'
import { useSettings } from '@/api/settings'
import { Loader2, ExternalLink, AlertTriangle, TrendingUp, Calendar, Users, DollarSign } from 'lucide-react'
import { DocLink } from '@/components/DocLink'

function usd(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined) return '—'
  return `$${value.toFixed(decimals)}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatHours(hours: number | null) {
  if (hours === null) return '—'
  if (hours < 24) return `${hours.toFixed(1)}h`
  const d = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return `${d}d ${h}h`
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
    </div>
  )
}

// ── Section 1 & 2: Running instance costs (items 1–6) ──────────────────────

function InstanceCostsSection() {
  const { data, isLoading } = useInstanceCosts()

  return (
    <SectionCard title="Running Instance Costs" icon={DollarSign}>
      {isLoading ? <LoadingRow /> : !data || data.instances.length === 0 ? (
        <p className="text-xs text-slate-500">No running instances.</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left pb-2 font-medium">Instance</th>
                  <th className="text-left pb-2 font-medium">Group</th>
                  <th className="text-left pb-2 font-medium">Machine type</th>
                  <th className="text-center pb-2 font-medium pr-3">Hourly</th>
                  <th className="text-center pb-2 font-medium pr-3">Daily</th>
                  <th className="text-center pb-2 font-medium">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {data.instances.map((inst) => (
                  <tr key={inst.name} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-1.5 pr-3 text-slate-200 font-mono">{inst.name}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{inst.group || '—'}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{inst.machine_type}</td>
                    <td className="py-1.5 pr-3 text-center text-slate-300">{usd(inst.hourly_usd, 4)}</td>
                    <td className="py-1.5 pr-3 text-center text-slate-300">{usd(inst.daily_usd)}</td>
                    <td className="py-1.5 text-center text-slate-300">{usd(inst.monthly_usd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-slate-200 font-semibold border-t border-slate-600">
                  <td className="pt-2 pr-3" colSpan={3}>
                    Total ({data.totals.count} instance{data.totals.count !== 1 ? 's' : ''})
                  </td>
                  <td className="pt-2 pr-3 text-center">{usd(data.totals.hourly_usd, 4)}</td>
                  <td className="pt-2 pr-3 text-center">{usd(data.totals.daily_usd)}</td>
                  <td className="pt-2 text-center">{usd(data.totals.monthly_usd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-600">Costs are on-demand estimates. Actual billing may differ due to discounts or commitments.</p>
        </div>
      )}
    </SectionCard>
  )
}

// ── Section 3: Cost per workshop (item 7) ──────────────────────────────────

function WorkshopCostsSection() {
  const { data, isLoading } = useWorkshopCosts()

  return (
    <SectionCard title="Cost per Workshop" icon={Users}>
      {isLoading ? <LoadingRow /> : !data || data.workshops.length === 0 ? (
        <p className="text-xs text-slate-500">No running workshop groups found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="text-left pb-2 font-medium">Workshop (group)</th>
                <th className="text-center pb-2 font-medium pr-6">Instances</th>
                <th className="text-left pb-2 font-medium">Started</th>
                <th className="text-right pb-2 font-medium">Running</th>
                <th className="text-center pb-2 font-medium pr-6">Cost so far</th>
                <th className="text-left pb-2 font-medium">Scheduled deletion</th>
                <th className="text-right pb-2 font-medium">Projected total</th>
              </tr>
            </thead>
            <tbody>
              {data.workshops.map((ws) => (
                <tr key={ws.group} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="py-1.5 pr-3 text-slate-200 font-mono">{ws.group}</td>
                  <td className="py-1.5 pr-6 text-center text-slate-400">{ws.instance_count}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{formatDate(ws.start_time)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{formatHours(ws.hours_running)}</td>
                  <td className="py-1.5 pr-6 text-center text-slate-300 font-medium">{usd(ws.cost_so_far_usd)}</td>
                  <td className="py-1.5 pr-3 text-slate-400">
                    {ws.delete_time ? formatDate(ws.delete_time) : <span className="text-slate-600">not scheduled</span>}
                  </td>
                  <td className="py-1.5 text-right text-slate-300">
                    {ws.projected_total_usd !== null ? usd(ws.projected_total_usd) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

// ── Section 4: Projected monthly cost (item 8) ─────────────────────────────

function ProjectedCostSection() {
  const { data, isLoading } = useProjectedCosts()

  const monthLabel = data?.month
    ? new Date(data.month + '-01').toLocaleString(undefined, { month: 'long', year: 'numeric' })
    : '…'

  return (
    <SectionCard title={`Projected Cost — ${monthLabel}`} icon={TrendingUp}>
      {isLoading ? <LoadingRow /> : !data ? (
        <p className="text-xs text-slate-500">No data available.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1">
              <p className="text-xs text-slate-500">Accrued this month</p>
              <p className="text-lg font-semibold text-slate-100">{usd(data.accrued_usd)}</p>
              <p className="text-xs text-slate-600">{data.running_count} instance{data.running_count !== 1 ? 's' : ''} running</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1">
              <p className="text-xs text-slate-500">Remaining in month</p>
              <p className="text-lg font-semibold text-slate-100">{usd(data.projected_remaining_usd)}</p>
              <p className="text-xs text-slate-600">{data.hours_remaining.toFixed(0)}h left · {usd(data.hourly_rate_usd, 4)}/hr</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1">
              <p className="text-xs text-slate-500">Scheduled workshops</p>
              <p className="text-lg font-semibold text-slate-100">{usd(data.scheduled_workshops_usd)}</p>
              <p className="text-xs text-slate-600">Future clone+delete pairs</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1">
              <p className="text-xs text-slate-500">Projected total</p>
              <p className="text-lg font-semibold text-slate-100">{usd(data.projected_total_usd)}</p>
              <p className="text-xs text-slate-600">Accrued + remaining + scheduled</p>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Projected costs are on-demand estimates based on current running instances and upcoming scheduled workshops. Actual billing may differ.
          </p>
        </div>
      )}
    </SectionCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Costs() {
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useCostSummary()
  const { data: settings } = useSettings()

  const projectId = settings?.active_project_id
  const billingConsoleUrl = `https://console.cloud.google.com/billing${projectId ? `?project=${projectId}` : ''}`

  return (
    <div className="space-y-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Costs</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Billing overview for the active GCP project</p>
          <DocLink path="screens/costs/" />
        </div>
      </div>

      {summaryLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading billing data…
        </div>
      )}

      {summaryError && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-5 text-sm text-red-400">
          Failed to load billing data: {summaryError instanceof Error ? summaryError.message : String(summaryError)}
        </div>
      )}

      {summaryData?.billing_enabled === null && summaryData.costs_error === 'permission_denied' && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
          <p className="text-sm text-slate-400">
            Billing account info is unavailable (the service account lacks billing read access) —
            cost estimates below are still accurate. You can view billing details in the{' '}
            <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
              GCP Billing Console
            </a>.
          </p>
        </div>
      )}

      {summaryData?.billing_enabled === false && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-sm text-slate-400">
          Billing is not enabled for this project.
        </div>
      )}

      {summaryData?.billing_enabled === true && (
        <>
          {/* Billing account */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Billing Account</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Account name</p>
                <p className="text-slate-200">{summaryData.display_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Account ID</p>
                <p className="text-slate-200 font-mono text-xs">{summaryData.billing_account_id}</p>
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

          <InstanceCostsSection />
          <WorkshopCostsSection />
          <ProjectedCostSection />
        </>
      )}

      {/* Show cost sections even without billing account access (pricing API works independently) */}
      {((!summaryData && !summaryLoading && !summaryError) ||
        (summaryData?.billing_enabled === null && summaryData?.costs_error === 'permission_denied')) && (
        <>
          <InstanceCostsSection />
          <WorkshopCostsSection />
          <ProjectedCostSection />
        </>
      )}
    </div>
  )
}
