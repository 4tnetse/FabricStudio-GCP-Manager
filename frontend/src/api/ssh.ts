import { useMutation } from '@tanstack/react-query'
import { apiPost } from './client'
import type { JobStatus } from '@/lib/types'

export interface SshExecuteParams {
  addresses: string[]
  mode: 'parallel' | 'sequential'
  command?: string
  configName?: string
}

export function useExecuteSsh() {
  return useMutation({
    mutationFn: ({ addresses, command, configName, mode }: SshExecuteParams) =>
      apiPost<JobStatus>('/ssh/execute', {
        addresses,
        commands: command ? [command] : [],
        config_name: configName ?? null,
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
