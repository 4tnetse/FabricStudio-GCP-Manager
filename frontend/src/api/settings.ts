import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, apiDelete, apiPost, apiClient } from './client'
import type { Settings, ProjectHealth } from '@/lib/types'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<Settings>('/settings'),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: Partial<Settings>) => apiPut<Settings>('/settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['version'] })
    },
  })
}

export function useUploadKeyFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await apiClient.post('/settings/keyfile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.removeQueries({ queryKey: ['settings', 'networks'] })
    },
  })
}

export function useDeleteKeyFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete('/settings/keyfile'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.removeQueries({ queryKey: ['settings', 'networks'] })
    },
  })
}

export function useTestTeamsWebhook() {
  return useMutation({
    mutationFn: (webhook_url: string) => apiPost('/settings/test-teams', { webhook_url }),
  })
}

export function useCreateNetwork() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiPost<{ name: string }>('/settings/networks', { name }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['settings', 'networks'] })
    },
  })
}

export function useNetworks(enabled: boolean, projectId?: string | null) {
  return useQuery({
    queryKey: ['settings', 'networks', projectId ?? ''],
    queryFn: () => apiGet<{ networks: string[] }>('/settings/networks'),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
    retry: false,
  })
}

export function useEnableApi() {
  return useMutation({
    mutationFn: (api_id: string) => apiPost('/settings/health/enable-api', { api_id }),
  })
}

export function useProjectHealth(enabled: boolean, projectId?: string | null) {
  return useQuery({
    queryKey: ['settings', 'health', projectId ?? ''],
    queryFn: () => apiGet<ProjectHealth>('/settings/health'),
    enabled: enabled && !!projectId,
    staleTime: Infinity,
    retry: false,
  })
}

export function useResetSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete('/settings'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
