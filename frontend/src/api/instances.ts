import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete, apiPatch } from './client'
import type { Instance, PublicIpsResponse } from '@/lib/types'

export interface InstanceFilters {
  zone?: string
  product?: string
  status?: string
  prepend?: string
}

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: () => apiGet<string[]>('/instances/zones'),
    staleTime: 5 * 60_000,
  })
}

export function useMachineTypes(zone: string) {
  return useQuery({
    queryKey: ['machine-types', zone],
    queryFn: () => apiGet<string[]>('/instances/machine-types', { zone }),
    enabled: !!zone,
    staleTime: 5 * 60_000,
  })
}

export function useInstances(filters?: InstanceFilters) {
  return useQuery({
    queryKey: ['instances', filters],
    queryFn: () => apiGet<Instance[]>('/instances', filters as Record<string, unknown>),
    refetchInterval: 30_000,
  })
}

export function useInstance(zone: string, name: string) {
  return useQuery({
    queryKey: ['instances', zone, name],
    queryFn: () => apiGet<Instance>(`/instances/${zone}/${name}`),
    enabled: !!zone && !!name,
  })
}

export function usePublicIps() {
  return useQuery({
    queryKey: ['instances', 'public-ips'],
    queryFn: () => apiGet<PublicIpsResponse>('/instances/public-ips'),
  })
}

export function useStartInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name }: { zone: string; name: string }) =>
      apiPost(`/instances/${zone}/${name}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useStopInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name }: { zone: string; name: string }) =>
      apiPost(`/instances/${zone}/${name}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useDeleteInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name }: { zone: string; name: string }) =>
      apiDelete(`/instances/${zone}/${name}`),
    onSettled: () => {
      // Refetch immediately, then rapidly for 90s to catch GCP removing the instance
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      ;[2, 5, 15, 30, 50, 70, 90].forEach((s) =>
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['instances'] }), s * 1000)
      )
    },
  })
}

export function useSetMachineType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name, machine_type }: { zone: string; name: string; machine_type: string }) =>
      apiPatch(`/instances/${zone}/${name}/machine-type`, { machine_type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useRenameInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name, new_name }: { zone: string; name: string; new_name: string }) =>
      apiPatch(`/instances/${zone}/${name}/rename`, { new_name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useMoveInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zone, name, target_zone }: { zone: string; name: string; target_zone: string }) =>
      apiPost(`/instances/${zone}/${name}/move`, { destination_zone: target_zone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useBulkOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      operation,
      instances,
    }: {
      operation: 'bulk-start' | 'bulk-stop' | 'bulk-delete'
      instances: Array<{ zone: string; name: string }>
    }) => apiPost<{ job_id: string }>(`/ops/${operation}`, { instances }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}
