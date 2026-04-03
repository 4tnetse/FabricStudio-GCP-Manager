import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'

export interface CostSummary {
  billing_enabled: boolean | null
  billing_account_id?: string
  billing_account_name?: string
  display_name?: string
  costs_error?: string
}

export interface MachineTypePrice {
  price_usd: number | null
  source?: string | null
  vcpus?: number
  memory_gib?: number
}

export interface InstanceCost {
  name: string
  zone: string
  machine_type: string
  group: string
  hourly_usd: number | null
  daily_usd: number | null
  monthly_usd: number | null
}

export interface InstanceCostSummary {
  instances: InstanceCost[]
  totals: {
    count: number
    hourly_usd: number
    daily_usd: number
    monthly_usd: number
  }
}

export interface WorkshopCost {
  group: string
  instance_count: number
  start_time: string | null
  hours_running: number | null
  hourly_total_usd: number
  cost_so_far_usd: number | null
  delete_schedule_name: string | null
  delete_time: string | null
  projected_total_usd: number | null
}

export interface WorkshopCostSummary {
  workshops: WorkshopCost[]
}

export interface ProjectedCost {
  month: string
  accrued_usd: number
  projected_remaining_usd: number
  scheduled_workshops_usd: number
  projected_total_usd: number
  hours_remaining: number
  running_count: number
  hourly_rate_usd: number
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

export function useInstanceCosts() {
  return useQuery({
    queryKey: ['costs', 'instances'],
    queryFn: () => apiGet<InstanceCostSummary>('/costs/instances'),
    staleTime: 2 * 60_000,
  })
}

export function useWorkshopCosts() {
  return useQuery({
    queryKey: ['costs', 'workshops'],
    queryFn: () => apiGet<WorkshopCostSummary>('/costs/workshops'),
    staleTime: 2 * 60_000,
  })
}

export function useProjectedCosts() {
  return useQuery({
    queryKey: ['costs', 'projected'],
    queryFn: () => apiGet<ProjectedCost>('/costs/projected'),
    staleTime: 5 * 60_000,
  })
}
