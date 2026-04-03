import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from './client'

export interface Workshop {
  id: string
  project_id: string
  name: string
  passphrase: string
  guest_password: string
  hostname_template: string
  fabric_workspace: string
  doc_link: string
  source_image: string
  machine_type: string
  zone: string
  count_start: number
  count_end: number
  start_time: string | null
  end_time: string | null
  status: 'draft' | 'scheduled' | 'deploying' | 'running' | 'ended'
  portal_enabled: boolean
  portal_url: string | null
  current_activity: string | null
  created_at: string
  updated_at: string
}

export interface Attendee {
  id: string
  workshop_id: string
  instance_name: string
  name: string
  email: string
  company: string
  registered_at: string
}

export interface WorkshopCreate {
  name: string
  passphrase: string
  guest_password: string
  hostname_template?: string
  fabric_workspace?: string
  doc_link?: string
  source_image: string
  machine_type: string
  zone: string
  count_start: number
  count_end: number
  start_time?: string | null
  end_time?: string | null
}

export interface WorkshopUpdate extends Partial<WorkshopCreate> {
  status?: string
  portal_enabled?: boolean
  portal_url?: string | null
  current_activity?: string | null
}

export function useWorkshops() {
  return useQuery({
    queryKey: ['workshops'],
    queryFn: () => apiGet<Workshop[]>('/workshops'),
    staleTime: 30_000,
  })
}

export function useWorkshop(id: string) {
  return useQuery({
    queryKey: ['workshops', id],
    queryFn: () => apiGet<Workshop>(`/workshops/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  })
}

export function useAttendees(workshopId: string) {
  return useQuery({
    queryKey: ['workshops', workshopId, 'attendees'],
    queryFn: () => apiGet<Attendee[]>(`/workshops/${workshopId}/attendees`),
    enabled: !!workshopId,
    staleTime: 10_000,
  })
}

export function useCreateWorkshop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: WorkshopCreate) => apiPost<Workshop>('/workshops', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] })
    },
  })
}

export function useUpdateWorkshop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: WorkshopUpdate }) =>
      apiPut<Workshop>(`/workshops/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workshops', id] })
      queryClient.invalidateQueries({ queryKey: ['workshops'] })
    },
  })
}

export function useDeleteWorkshop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/workshops/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] })
    },
  })
}

export function useRemoveAttendee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workshopId, attendeeId }: { workshopId: string; attendeeId: string }) =>
      apiDelete<void>(`/workshops/${workshopId}/attendees/${attendeeId}`),
    onSuccess: (_, { workshopId }) => {
      queryClient.invalidateQueries({ queryKey: ['workshops', workshopId, 'attendees'] })
    },
  })
}

export function useStartWorkshop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ job_id: string }>(`/workshops/${id}/start`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['workshops', id] })
      queryClient.invalidateQueries({ queryKey: ['workshops'] })
    },
  })
}

export function useStopWorkshop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ job_id: string }>(`/workshops/${id}/stop`, {}),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['workshops', id] })
      queryClient.invalidateQueries({ queryKey: ['workshops'] })
    },
  })
}
