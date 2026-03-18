import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from './client'
import type { FirewallAcl, GlobalAccess, FirewallRule } from '@/lib/types'

export function useFirewallAcl() {
  return useQuery({
    queryKey: ['firewall', 'acl'],
    queryFn: () => apiGet<FirewallAcl>('/firewall/acl'),
  })
}

export function useAddAclIp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ip: string) => apiPost('/firewall/acl/add', { ip_address: ip }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall', 'acl'] })
      queryClient.invalidateQueries({ queryKey: ['firewall', 'rules'] })
    },
  })
}

export function useRemoveAclIp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ip: string) => apiDelete('/firewall/acl/remove', { ip_address: ip }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall', 'acl'] })
      queryClient.invalidateQueries({ queryKey: ['firewall', 'rules'] })
    },
  })
}

export function useGlobalAccess() {
  return useQuery({
    queryKey: ['firewall', 'global-access'],
    queryFn: () => apiGet<GlobalAccess>('/firewall/global-access'),
  })
}

export function useSetGlobalAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => apiPost('/firewall/global-access', { enabled }),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['firewall', 'global-access'] })
      queryClient.setQueryData(['firewall', 'global-access'], { enabled })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall', 'global-access'] })
      queryClient.invalidateQueries({ queryKey: ['firewall', 'rules'] })
    },
  })
}

export function useFirewallRules() {
  return useQuery({
    queryKey: ['firewall', 'rules'],
    queryFn: () => apiGet<FirewallRule[]>('/firewall/rules'),
  })
}
