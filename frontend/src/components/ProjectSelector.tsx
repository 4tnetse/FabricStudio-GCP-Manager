import { useProjects, useSelectProject } from '@/api/projects'
import { useSettings } from '@/api/settings'
import { ChevronDown, FolderOpen, Loader2, AlertTriangle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/types'

export function ProjectSelector() {
  const { data: settings } = useSettings()
  const { data: projects, isLoading } = useProjects()
  const selectProject = useSelectProject()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const noKey = !settings?.has_keys

  const currentProject = projects?.find((p) => p.is_selected) ?? projects?.[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSelect(projectId: string) {
    setOpen(false)
    try {
      await selectProject.mutateAsync(projectId)
      toast.success('Project switched')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to switch project')
    }
  }

  if (noKey) {
    return (
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-800/60 bg-yellow-900/20 text-yellow-400 text-xs w-full hover:bg-yellow-900/40 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>No key configured</span>
      </button>
    )
  }

  // Group projects by key
  const grouped: { keyId: string; keyName: string; projects: Project[] }[] = []
  if (projects) {
    for (const p of projects) {
      const keyId = p.key_id ?? '__unknown__'
      const keyName = p.key_name ?? 'Unknown key'
      const existing = grouped.find((g) => g.keyId === keyId)
      if (existing) {
        existing.projects.push(p)
      } else {
        grouped.push({ keyId, keyName, projects: [p] })
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={currentProject?.name ?? currentProject?.id}
        className={cn(
          'flex items-center gap-2 w-full pl-6 pr-3 py-2 rounded-lg text-sm transition-colors',
          'bg-slate-800 hover:bg-slate-700 text-slate-200',
          open && 'border-slate-600',
        )}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        ) : (
          <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <span className="flex-1 text-left truncate">
          {currentProject?.key_name ?? currentProject?.name ?? currentProject?.id ?? 'Select project'}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
          {!projects || projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No projects available</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {grouped.map((group, gi) => (
                <div key={group.keyId}>
                  {/* Key group header */}
                  <div className={cn(
                    'px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-800/60 select-none',
                    gi > 0 && 'border-t border-slate-700/60'
                  )}>
                    {group.keyName}
                  </div>
                  {group.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleSelect(project.id)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                        project.is_selected
                          ? 'bg-blue-900/40 text-blue-300'
                          : 'text-slate-300 hover:bg-slate-800',
                      )}
                    >
                      <FolderOpen className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{project.name || project.id}</div>
                        {project.name && project.name !== project.id && (
                          <div className="text-xs text-slate-500 truncate">{project.id}</div>
                        )}
                      </div>
                      {project.is_selected && (
                        <span className="text-xs text-blue-400">active</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
