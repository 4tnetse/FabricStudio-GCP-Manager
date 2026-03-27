import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from './client'

export interface Schedule {
  id: string
  name: string
  job_type: 'clone' | 'configure'
  cron_expression: string
  timezone: string
  enabled: boolean
  project_id: string
  key_id: string
  payload: Record<string, unknown>
  settings_snapshot: Record<string, unknown>
  cloud_scheduler_job_name: string
  created_at: string | null
  updated_at: string | null
  created_by: string
}

export interface JobRun {
  id: string
  schedule_id: string
  schedule_name: string
  job_type: string
  triggered_by: 'scheduler' | 'manual'
  status: 'running' | 'completed' | 'failed'
  started_at: string | null
  finished_at: string | null
  log_lines: string[]
  error_summary: string | null
  project_id: string
}

export interface ScheduleCreate {
  name: string
  job_type: 'clone' | 'configure'
  cron_expression: string
  timezone?: string
  enabled?: boolean
  payload: Record<string, unknown>
  project_id?: string
}

export interface ScheduleUpdate {
  name?: string
  cron_expression?: string
  timezone?: string
  enabled?: boolean
  payload?: Record<string, unknown>
}

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiGet<Schedule[]>('/schedules'),
  })
}

export function useSchedule(id: string | null) {
  return useQuery({
    queryKey: ['schedules', id],
    queryFn: () => apiGet<Schedule>(`/schedules/${id}`),
    enabled: !!id,
  })
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ScheduleCreate) => apiPost<Schedule>('/schedules', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ScheduleUpdate }) =>
      apiPut<Schedule>(`/schedules/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export function useEnableSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<Schedule>(`/schedules/${id}/enable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export function useDisableSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<Schedule>(`/schedules/${id}/disable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export function useJobRuns(scheduleId: string | null) {
  return useQuery({
    queryKey: ['schedules', scheduleId, 'runs'],
    queryFn: () => apiGet<JobRun[]>(`/schedules/${scheduleId}/runs`),
    enabled: !!scheduleId,
  })
}

export function useJobRun(runId: string | null) {
  return useQuery({
    queryKey: ['job-runs', runId],
    queryFn: () => apiGet<JobRun>(`/schedules/runs/${runId}`),
    enabled: !!runId,
  })
}

export function useDetectCloudRunUrl() {
  return useMutation({
    mutationFn: () => apiGet<{ url: string; region: string }>('/schedules/cloud-run-url'),
  })
}

export function useTriggerSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => apiPost<{ run_id: string; schedule_id: string }>(`/schedules/${scheduleId}/trigger`),
    onSuccess: (_data, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', scheduleId, 'runs'] })
    },
  })
}
