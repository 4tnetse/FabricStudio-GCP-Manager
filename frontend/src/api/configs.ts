import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from './client'

export interface ConfigFile {
  name: string
  size: number
}

export interface ConfigDetail {
  name: string
  content: string
  parsed: Record<string, string>
}

export function useConfigs() {
  return useQuery({
    queryKey: ['configs'],
    queryFn: () => apiGet<ConfigFile[]>('/configs'),
  })
}

export function useConfig(name: string | null) {
  return useQuery({
    queryKey: ['configs', name],
    queryFn: () => apiGet<ConfigDetail>(`/configs/${name}`),
    enabled: !!name,
  })
}

export function useCreateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; content: string }) => apiPost('/configs', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      apiPut(`/configs/${name}`, { content }),
    onSuccess: (_data, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['configs', name] })
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
