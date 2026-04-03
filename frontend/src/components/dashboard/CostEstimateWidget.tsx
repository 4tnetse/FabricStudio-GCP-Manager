import { Receipt, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInstanceCosts } from '@/api/costs'

function usd(value: number, decimals = 2) {
  return `$${value.toFixed(decimals)}`
}

export function CostEstimateWidget() {
  const { data, isLoading } = useInstanceCosts()

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Cost Estimate</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : !data || data.totals.count === 0 ? (
        <div className="text-sm text-slate-500">No running instances</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 space-y-1">
              <p className="text-xs text-slate-500">Hourly</p>
              <p className="text-base font-semibold text-slate-100">{usd(data.totals.hourly_usd, 4)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 space-y-1">
              <p className="text-xs text-slate-500">Daily</p>
              <p className="text-base font-semibold text-slate-100">{usd(data.totals.daily_usd)}</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-3 py-2.5 space-y-1">
              <p className="text-xs text-slate-500">Monthly</p>
              <p className="text-base font-semibold text-slate-100">{usd(data.totals.monthly_usd)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-600">{data.totals.count} running instance{data.totals.count !== 1 ? 's' : ''} · on-demand estimate</p>
        </div>
      )}

      <Link to="/costs" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View cost details →
      </Link>
    </div>
  )
}
