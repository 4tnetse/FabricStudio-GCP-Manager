import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { Config } from '@/lib/types'

export function useConfigs() {
  return useQuery({
    queryKey: ['configs'],
    queryFn: () => apiGet<Config[]>('/configs'),
  })
}

export function useConfig(name: string) {
  return useQuery({
    queryKey: ['configs', name],
    queryFn: () => apiGet<Config>(`/configs/${name}`),
    enabled: !!name,
  })
}

export function useCreateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: Config) => apiPost<Config>('/configs', config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, config }: { name: string; config: Partial<Config> }) =>
      apiPut<Config>(`/configs/${name}`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}

export function useDeleteConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiDelete(`/configs/${name}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}
