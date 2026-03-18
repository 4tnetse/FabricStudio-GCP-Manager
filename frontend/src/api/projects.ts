import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './client'
import { useSettings } from './settings'
import type { Project } from '@/lib/types'

export function useProjects() {
  const { data: settings } = useSettings()
  const hasKey = !!settings?.service_account_key_path
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet<Project[]>('/projects'),
    enabled: hasKey,
    retry: false,
  })
}

export function useSelectProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (project_id: string) => apiPost('/projects/select', { project_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}
