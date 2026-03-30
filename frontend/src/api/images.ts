import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from './client'
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

export function useGetUploadUrl() {
  return useMutation({
    mutationFn: (filename: string) =>
      apiGet<{ upload_url: string; gcs_uri: string; bucket: string; object_name: string }>(
        `/images/upload-url?filename=${encodeURIComponent(filename)}`
      ),
  })
}

export function useCleanupStaging() {
  return useMutation({
    mutationFn: ({ bucket, object_name }: { bucket: string; object_name: string }) =>
      apiPost('/images/staging/cleanup', { bucket, object_name }),
  })
}

export function useImportImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      gcs_uri: string
      bucket: string
      object_name: string
      family?: string
      description?: string
    }) => apiPost<{ job_id: string }>('/images/import', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  })
}
