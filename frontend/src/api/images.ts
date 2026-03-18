import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { ImageInfo } from '@/lib/types'

export function useImages() {
  return useQuery({
    queryKey: ['images'],
    queryFn: () => apiGet<ImageInfo[]>('/images'),
  })
}
