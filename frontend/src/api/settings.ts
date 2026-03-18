import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, apiDelete, apiClient } from './client'
import type { Settings } from '@/lib/types'

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
    },
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
