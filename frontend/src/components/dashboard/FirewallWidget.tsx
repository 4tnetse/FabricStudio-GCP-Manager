import { Shield, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFirewallRules, useFirewallAcl, useGlobalAccess } from '@/api/firewall'
import { cn } from '@/lib/utils'

export function FirewallWidget() {
  const { data: rules = [], isLoading: rulesLoading } = useFirewallRules()
  const { data: acl, isLoading: aclLoading } = useFirewallAcl()
  const { data: globalAccess, isLoading: globalLoading } = useGlobalAccess()

  const isLoading = rulesLoading || aclLoading || globalLoading

  const topRules = [...rules]
    .filter((r) => !r.disabled)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)

  const ipCount = acl?.ips?.length ?? 0

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Firewall</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 px-2.5 py-2">
              <div className="text-slate-500 mb-0.5">Rules</div>
              <div className="font-semibold text-slate-200">{rules.length} total</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 px-2.5 py-2">
              <div className="text-slate-500 mb-0.5">Global Access</div>
              <div className={cn('font-semibold', globalAccess?.enabled ? 'text-green-400' : 'text-slate-400')}>
                {globalAccess?.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>

          <div className="text-xs">
            <span className="text-slate-500">IP Allowlist: </span>
            {ipCount > 0 ? (
              <span className="text-slate-200">{ipCount} IP{ipCount !== 1 ? 's' : ''} configured</span>
            ) : (
              <span className="text-red-400">Not configured</span>
            )}
          </div>

          {topRules.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Top rules</div>
              {topRules.map((rule) => (
                <div key={rule.name} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate flex-1">{rule.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">P{rule.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Link to="/firewall" className="block text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Manage firewall →
      </Link>
    </div>
  )
}
