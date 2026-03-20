import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useInstances } from '@/api/instances'
import { apiGet, apiPost, apiDelete } from '@/api/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function useInstanceLabels(zone: string, name: string) {
  return useQuery({
    queryKey: ['labels', zone, name],
    queryFn: () => apiGet<Record<string, string>>(`/instances/${zone}/${name}/labels`),
    enabled: !!zone && !!name,
  })
}

function useAddLabel(zone: string, name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiPost(`/instances/${zone}/${name}/labels`, { key, value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels', zone, name] }),
  })
}

function useRemoveLabel(zone: string, name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiDelete(`/instances/${zone}/${name}/labels/${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels', zone, name] }),
  })
}

export default function Labels() {
  const { data: instances = [], isLoading: instancesLoading } = useInstances()
  const [searchParams] = useSearchParams()
  const [selectedKey, setSelectedKey] = useState(() => searchParams.get('select') ?? '')
  const [search, setSearch] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const selected = useMemo(() => {
    if (!selectedKey) return null
    const [zone, name] = selectedKey.split('|||')
    return { zone, name }
  }, [selectedKey])

  const { data: labels, isLoading: labelsLoading } = useInstanceLabels(
    selected?.zone ?? '',
    selected?.name ?? '',
  )
  const addLabel = useAddLabel(selected?.zone ?? '', selected?.name ?? '')
  const removeLabel = useRemoveLabel(selected?.zone ?? '', selected?.name ?? '')

  const filteredInstances = useMemo(
    () =>
      instances.filter((i) =>
        !search || i.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [instances, search],
  )

  async function handleAdd() {
    if (!newKey.trim() || !selected) return
    try {
      await addLabel.mutateAsync({ key: newKey.trim(), value: newValue.trim() })
      setNewKey('')
      setNewValue('')
      toast.success(`Label "${newKey}" added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add label')
    }
  }

  async function handleRemove(key: string) {
    if (!selected) return
    try {
      await removeLabel.mutateAsync(key)
      toast.success(`Label "${key}" removed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove label')
    }
  }

  const LABEL_RE = /^[a-z0-9_-]{0,63}$/
  const keyError = newKey && !LABEL_RE.test(newKey)
    ? 'Lowercase letters, numbers, underscores and dashes only (max 63 chars)' : null
  const valueError = newValue && !LABEL_RE.test(newValue)
    ? 'Lowercase letters, numbers, underscores and dashes only (max 63 chars)' : null

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500'
  const inputErrorClass =
    'w-full px-3 py-2 rounded-lg border border-red-500 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 placeholder:text-slate-500'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Labels</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage instance labels</p>
      </div>

      {/* Instance selector */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Select Instance</h2>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-200 hover:bg-slate-700"
          >
            <span>{selected ? selected.name : 'Select an instance...'}</span>
            <Search className="w-4 h-4 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
              <div className="p-2 border-b border-slate-800">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {instancesLoading ? (
                  <div className="px-3 py-4 text-center text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  </div>
                ) : filteredInstances.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">No instances found</div>
                ) : (
                  filteredInstances.map((inst) => {
                    const key = `${inst.zone}|||${inst.name}`
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedKey(key)
                          setDropdownOpen(false)
                        }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-slate-800 ${
                          selectedKey === key ? 'bg-blue-900/30 text-blue-300' : 'text-slate-300'
                        }`}
                      >
                        <span>{inst.name}</span>
                        <span className="text-xs text-slate-500">{inst.zone}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Labels editor */}
      {selected && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Labels for <span className="text-blue-300">{selected.name}</span>
            </h2>
            {labelsLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {/* Current labels */}
          {labelsLoading ? (
            <div className="py-4 text-center text-slate-500">Loading labels...</div>
          ) : !labels || Object.keys(labels).length === 0 ? (
            <div className="py-4 text-center text-slate-500 text-sm">No labels set</div>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(labels).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700"
                >
                  <span className="text-xs text-slate-400">{key}</span>
                  <span className="text-slate-600">=</span>
                  <span className="text-xs text-slate-200 flex-1">{value}</span>
                  <button
                    onClick={() => handleRemove(key)}
                    disabled={removeLabel.isPending}
                    className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add label form */}
          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 mb-2">Add label</h3>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  className={keyError ? inputErrorClass : inputClass}
                  placeholder="key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                {keyError && <p className="text-xs text-red-400 mt-1">{keyError}</p>}
              </div>
              <span className="text-slate-600 mt-2.5">=</span>
              <div className="flex-1">
                <input
                  className={valueError ? inputErrorClass : inputClass}
                  placeholder="value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                {valueError && <p className="text-xs text-red-400 mt-1">{valueError}</p>}
              </div>
              <button
                onClick={handleAdd}
                disabled={!newKey.trim() || !!keyError || !!valueError || addLabel.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm shrink-0 mt-0.5"
              >
                {addLabel.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
