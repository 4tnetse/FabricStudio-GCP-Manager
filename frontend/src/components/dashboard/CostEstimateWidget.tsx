import { Receipt, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { useInstances } from '@/api/instances'
import { apiGet } from '@/api/client'
import type { MachineTypePrice } from '@/api/costs'

export function CostEstimateWidget() {
  const { data: instances = [], isLoading: instancesLoading } = useInstances()

  const runningInstances = instances.filter((i) => i.status === 'RUNNING')

  const uniqueCombos = Array.from(
    new Map(runningInstances.map((i) => [`${i.machine_type}::${i.zone}`, { machine_type: i.machine_type, zone: i.zone }])).values()
  )

  const priceQueries = useQueries({
    queries: uniqueCombos.map((combo) => ({
      queryKey: ['machine-type-price', combo.machine_type, combo.zone],
      queryFn: () => apiGet<MachineTypePrice>('/costs/machine-type-price', { machine_type: combo.machine_type, zone: combo.zone }),
      staleTime: 60 * 60_000,
      enabled: !!combo.machine_type && !!combo.zone,
    })),
  })

  const pricesLoading = priceQueries.some((q) => q.isLoading)
  const priceMap = new Map<string, number | null>()
  uniqueCombos.forEach((combo, i) => {
    const data = priceQueries[i]?.data
    priceMap.set(`${combo.machine_type}::${combo.zone}`, data?.price_usd ?? null)
  })

  const allPricesAvailable = runningInstances.length > 0 && !pricesLoading &&
    runningInstances.every((i) => priceMap.get(`${i.machine_type}::${i.zone}`) !== null)

  let totalHourly: number | null = null
  if (allPricesAvailable) {
    totalHourly = runningInstances.reduce((sum, i) => {
      const price = priceMap.get(`${i.machine_type}::${i.zone}`) ?? 0
      return sum + price
    }, 0)
  }

  const isLoading = instancesLoading || pricesLoading

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
      ) : runningInstances.length === 0 ? (
        <div className="text-sm text-slate-500">No running instances</div>
      ) : totalHourly !== null ? (
        <div className="space-y-1">
          <div className="text-2xl font-semibold text-slate-100">~${totalHourly.toFixed(2)} <span className="text-sm font-normal text-slate-400">/ hr</span></div>
          <div className="flex gap-4 text-xs text-slate-400">
            <span>~${(totalHourly * 24).toFixed(2)} / day</span>
            <span>~${(totalHourly * 24 * 30).toFixed(2)} / mo</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{runningInstances.length} running instance{runningInstances.length !== 1 ? 's' : ''}</div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-lg font-semibold text-slate-100">{runningInstances.length} running</div>
          <div className="text-xs text-slate-500">pricing unavailable</div>
        </div>
      )}

      <Link to="/costs" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        View cost details →
      </Link>
    </div>
  )
}
