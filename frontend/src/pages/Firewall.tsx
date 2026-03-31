import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, RefreshCw, Wifi, X } from 'lucide-react'
import type { FirewallRule } from '@/lib/types'
import { DocLink } from '@/components/DocLink'
import {
  useFirewallAcl,
  useAddAclIp,
  useRemoveAclIp,
  useGlobalAccess,
  useSetGlobalAccess,
  useFirewallRules,
} from '@/api/firewall'

async function detectMyIp(): Promise<string> {
  const response = await fetch('https://api.ipify.org?format=json')
  const data = await response.json() as { ip: string }
  return data.ip
}

function FirewallRuleDetail({ rule, onClose }: { rule: FirewallRule; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">{rule.name}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2 text-xs">
          {([
            ['Direction', <span className={rule.direction === 'INGRESS' ? 'text-green-400' : 'text-orange-400'}>{rule.direction}</span>],
            ['Priority', rule.priority],
            ['Status', <span className={rule.disabled ? 'text-slate-400' : 'text-green-400'}>{rule.disabled ? 'Disabled' : 'Active'}</span>],
            ['Source Ranges', rule.source_ranges?.length ? rule.source_ranges.join(', ') : '—'],
            ['Target Tags', rule.target_tags?.length ? rule.target_tags.join(', ') : '—'],
            ['Allowed', rule.allowed?.length
              ? rule.allowed.map(a => a.ports?.length ? `${a.IPProtocol}:${a.ports.join(',')}` : a.IPProtocol).join(', ')
              : '—'],
          ] as [string, React.ReactNode][]).map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <span className="w-28 shrink-0 text-slate-400">{label}</span>
              <span className="text-slate-200 break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Firewall() {
  const { data: acl, isLoading: aclLoading } = useFirewallAcl()
  const addIp = useAddAclIp()
  const removeIp = useRemoveAclIp()
  const { data: globalAccess, isLoading: globalLoading } = useGlobalAccess()
  const setGlobalAccess = useSetGlobalAccess()
  const { data: rules, isLoading: rulesLoading, error: rulesError } = useFirewallRules()

  const [newIp, setNewIp] = useState('')
  const [detectingIp, setDetectingIp] = useState(false)
  const [selectedRule, setSelectedRule] = useState<FirewallRule | null>(null)

  async function handleAddIp() {
    const ip = newIp.trim()
    if (!ip) return
    try {
      await addIp.mutateAsync(ip)
      setNewIp('')
      toast.success(`Added ${ip} to allowlist`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add IP')
    }
  }

  async function handleRemoveIp(ip: string) {
    try {
      await removeIp.mutateAsync(ip)
      toast.success(`Removed ${ip}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove IP')
    }
  }

  async function handleDetectIp() {
    setDetectingIp(true)
    try {
      const ip = await detectMyIp()
      setNewIp(ip)
    } catch {
      toast.error('Failed to detect public IP')
    } finally {
      setDetectingIp(false)
    }
  }

  async function handleGlobalToggle() {
    const current = globalAccess?.enabled ?? false
    try {
      await setGlobalAccess.mutateAsync(!current)
      toast.success(`Global access ${!current ? 'enabled' : 'disabled'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update global access')
    }
  }

  return (
    <div className="space-y-6">
      {selectedRule && <FirewallRuleDetail rule={selectedRule} onClose={() => setSelectedRule(null)} />}
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Firewall</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Manage firewall rules and access control</p>
          <DocLink path="screens/firewall/" />
        </div>
      </div>

      {/* Section 1: Source IP Allowlist */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Source IP Allowlist</h2>
            <p className="text-xs text-slate-400 mt-0.5">workshop-source-networks rule</p>
          </div>
          {aclLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        {/* Add IP form */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. 203.0.113.0/24"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
          />
          <button
            onClick={handleDetectIp}
            disabled={detectingIp}
            title="Detect my public IP"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm disabled:opacity-50"
          >
            {detectingIp ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            Detect
          </button>
          <button
            onClick={handleAddIp}
            disabled={!newIp.trim() || addIp.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
          >
            {addIp.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add
          </button>
        </div>

        {/* IP list */}
        {aclLoading ? (
          <div className="py-4 text-center text-slate-500 text-sm">Loading...</div>
        ) : !acl?.ips?.length ? (
          <div className="py-4 text-center text-slate-500 text-sm">No IPs in allowlist</div>
        ) : (
          <div className="space-y-1.5">
            {acl.ips.map((ip) => (
              <div
                key={ip}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 border border-slate-700"
              >
                <span className="text-sm text-slate-200">{ip}</span>
                <button
                  onClick={() => handleRemoveIp(ip)}
                  disabled={removeIp.isPending}
                  className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Global Access */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Global Access</h2>
            <p className="text-xs text-slate-400 mt-0.5">workshop-source-any rule — allow all source IPs</p>
          </div>
          {globalLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : (
            <button
              onClick={handleGlobalToggle}
              disabled={setGlobalAccess.isPending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                globalAccess?.enabled ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  globalAccess?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>
        {!globalLoading && (
          <p className="text-xs mt-3 text-slate-400">
            Status:{' '}
            <span className={globalAccess?.enabled ? 'text-yellow-400' : 'text-green-400'}>
              {globalAccess?.enabled ? 'Enabled — all IPs allowed' : 'Disabled — using Source IP Allowlist'}
            </span>
          </p>
        )}
      </div>

      {/* Section 3: All Firewall Rules */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">All Firewall Rules</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              All rules in the current project —{' '}
              <a
                href="https://console.cloud.google.com/net-security/firewall-manager/firewall-policies/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Open in GCP Console
              </a>
            </p>
          </div>
          {rulesLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Name</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Direction</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Priority</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Source Ranges</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Target Tags</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {rulesLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : rulesError ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-red-400 text-xs">
                      {rulesError instanceof Error ? rulesError.message : 'Failed to load firewall rules'}
                    </td>
                  </tr>
                ) : !rules?.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No firewall rules found
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.name} className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelectedRule(rule)}>
                      <td className="px-3 py-2.5 text-slate-200">{rule.name}</td>
                      <td className={`px-3 py-2.5 text-xs ${rule.direction === 'INGRESS' ? 'text-green-400' : 'text-orange-400'}`}>
                        {rule.direction}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{rule.priority}</td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {rule.source_ranges?.join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {rule.target_tags?.join(', ') || '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${rule.disabled ? 'text-slate-400' : 'text-green-400'}`}>
                        {rule.disabled ? 'Disabled' : 'Active'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!rulesLoading && rules && (
            <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-500 flex items-center gap-2">
              <RefreshCw className="w-3 h-3" />
              {rules.length} rules
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
