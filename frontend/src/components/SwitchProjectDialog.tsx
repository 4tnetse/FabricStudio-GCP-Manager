import { useState } from 'react'
import { useSelectProject } from '@/api/projects'
import { toast } from 'sonner'
import type { KeyInfo } from '@/lib/types'
import { FolderOpen } from 'lucide-react'

interface Props {
  keyInfo: KeyInfo
  onClose: () => void
}

export function SwitchProjectDialog({ keyInfo, onClose }: Props) {
  const selectProject = useSelectProject()
  const [selected, setSelected] = useState(
    keyInfo.projects.length === 1 ? keyInfo.projects[0].id : ''
  )

  async function handleSwitch() {
    if (!selected) return
    try {
      await selectProject.mutateAsync(selected)
      toast.success('Active project switched')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to switch project')
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">Switch active project?</h2>
        <p className="text-sm text-slate-400">
          Key <span className="text-slate-200 font-medium">{keyInfo.display_name}</span> was uploaded successfully.
          {keyInfo.projects.length > 0 && ' Do you want to switch to one of its projects?'}
        </p>

        {keyInfo.projects.length === 0 && (
          <p className="text-sm text-yellow-400">No projects found for this key.</p>
        )}

        {keyInfo.projects.length === 1 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-sm text-slate-200">
            <FolderOpen className="w-4 h-4 text-slate-400" />
            {keyInfo.projects[0].name || keyInfo.projects[0].id}
          </div>
        )}

        {keyInfo.projects.length > 1 && (
          <div className="space-y-1">
            {keyInfo.projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  selected === p.id
                    ? 'bg-blue-900/40 text-blue-300 border border-blue-700'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-transparent'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.name || p.id}</div>
                  {p.name && p.name !== p.id && (
                    <div className="text-xs text-slate-500 truncate">{p.id}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Skip
          </button>
          {keyInfo.projects.length > 0 && (
            <button
              onClick={handleSwitch}
              disabled={!selected || selectProject.isPending}
              className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
            >
              Switch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
