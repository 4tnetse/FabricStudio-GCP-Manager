import { useMutation } from '@tanstack/react-query'
import { apiPost } from './client'
import type { JobStatus } from '@/lib/types'

export interface SshExecuteParams {
  addresses: string[]
  command: string
  mode: 'parallel' | 'sequential'
}

export function useExecuteSsh() {
  return useMutation({
    mutationFn: ({ addresses, command, mode }: SshExecuteParams) =>
      apiPost<JobStatus>('/ssh/execute', {
        addresses,
        commands: [command],
        parallel: mode === 'parallel',
      }),
  })
}

export function useTestSsh() {
  return useMutation({
    mutationFn: (addresses: string[]) =>
      apiPost<JobStatus>('/ssh/test', { addresses }),
  })
}
