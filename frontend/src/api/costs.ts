import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'

export interface CostSummary {
  billing_enabled: boolean | null
  billing_account_id?: string
  billing_account_name?: string
  display_name?: string
  start_date?: string
  end_date?: string
  costs?: unknown
  costs_error?: string
}

export interface MachineTypePrice {
  price_usd: number | null
  source?: string | null
  vcpus?: number
  memory_gib?: number
}

export function useMachineTypePrice(machineType: string, zone: string) {
  return useQuery({
    queryKey: ['machine-type-price', machineType, zone],
    queryFn: () => apiGet<MachineTypePrice>('/costs/machine-type-price', { machine_type: machineType, zone }),
    enabled: !!machineType && !!zone,
    staleTime: 60 * 60_000,
  })
}

export function useCostSummary() {
  return useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: () => apiGet<CostSummary>('/costs/summary'),
    staleTime: 5 * 60_000,
  })
}
