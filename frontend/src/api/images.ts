import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from './client'
import type { ImageInfo } from '@/lib/types'

export function useImages() {
  return useQuery({
    queryKey: ['images'],
    queryFn: () => apiGet<ImageInfo[]>('/images'),
  })
}

export function useUpdateImageDescription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      apiPatch(`/images/${name}`, { description }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  })
}
