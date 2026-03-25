import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, apiDelete } from './client'
import type { KeyInfo } from '@/lib/types'

export function useKeys() {
  return useQuery({
    queryKey: ['keys'],
    queryFn: async () => {
      const response = await apiClient.get('/settings/keys')
      return response.data as KeyInfo[]
    },
  })
}

export function useUploadKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await apiClient.post('/settings/keys', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data as KeyInfo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => apiDelete(`/settings/keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}

export function useRenameKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ keyId, displayName }: { keyId: string; displayName: string }) =>
      apiClient.patch(`/settings/keys/${keyId}`, { display_name: displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
