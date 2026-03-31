import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { FileCode, Plus, Trash2, Save, FileText } from 'lucide-react'
import { useConfigs, useConfig, useCreateConfig, useUpdateConfig, useDeleteConfig } from '@/api/configs'
import { DocLink } from '@/components/DocLink'

const NEW_FILE = '__new__'

export default function Configurations() {
  const { data: files, isLoading } = useConfigs()
  const createConfig = useCreateConfig()
  const updateConfig = useUpdateConfig()
  const deleteConfig = useDeleteConfig()

  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)

  const isNew = selected === NEW_FILE
  const { data: detail } = useConfig(isNew ? null : selected)

  // Load content when a file is selected
  useEffect(() => {
    if (detail) {
      setContent(detail.content)
      setDirty(false)
    }
  }, [detail])

  function handleSelect(name: string) {
    setSelected(name)
    setDirty(false)
  }

  function handleNew() {
    setSelected(NEW_FILE)
    setNewName('')
    setContent('')
    setDirty(false)
  }

  function handleContentChange(value: string) {
    setContent(value)
    setDirty(true)
  }

  async function handleSave() {
    if (isNew) {
      const name = newName.trim()
      if (!name) {
        toast.error('Enter a file name')
        return
      }
      try {
        await createConfig.mutateAsync({ name, content })
        const finalName = name.endsWith('.conf') ? name : name + '.conf'
        toast.success(`Created ${finalName}`)
        setSelected(finalName)
        setDirty(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create config')
      }
    } else if (selected) {
      try {
        await updateConfig.mutateAsync({ name: selected, content })
        toast.success(`Saved ${selected}`)
        setDirty(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save config')
      }
    }
  }

  async function handleDelete() {
    if (!selected || isNew) return
    if (!confirm(`Delete ${selected}?`)) return
    try {
      await deleteConfig.mutateAsync(selected)
      toast.success(`Deleted ${selected}`)
      setSelected(null)
      setContent('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete config')
    }
  }

  const isSaving = createConfig.isPending || updateConfig.isPending

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">SSH Configurations</h1>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm text-slate-400">Manage and edit configuration files</p>
          <DocLink path="screens/configurations/" />
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* File list */}
        <div className="w-56 shrink-0 rounded-xl bg-slate-800/30 border border-slate-700 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-200">Files</span>
            </div>
            <button
              onClick={handleNew}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="New config file"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {isLoading && (
              <p className="px-4 py-3 text-xs text-slate-500">Loading...</p>
            )}
            {!isLoading && files?.length === 0 && selected !== NEW_FILE && (
              <p className="px-4 py-3 text-xs text-slate-500">No config files yet.</p>
            )}
            {isNew && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 text-blue-300 text-sm">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate italic">New file...</span>
              </div>
            )}
            {[...(files ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
              <button
                key={f.name}
                onClick={() => handleSelect(f.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  selected === f.name
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 rounded-xl bg-slate-800/30 border border-slate-700 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a file or create a new one
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                {isNew ? (
                  <input
                    className="bg-transparent text-slate-200 text-sm font-medium outline-none placeholder:text-slate-500 flex-1"
                    placeholder="filename.conf"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <span className="text-sm font-medium text-slate-200">{selected}</span>
                )}
                <div className="flex items-center gap-2 ml-4">
                  {!isNew && selected !== 'example.conf' && (
                    <button
                      onClick={handleDelete}
                      className="p-1.5 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={isSaving || (!dirty && !isNew)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <textarea
                className="code-editor flex-1 w-full bg-slate-950 text-slate-200 text-sm font-mono p-4 resize-none outline-none border-0"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                spellCheck={false}
                placeholder="# Config content..."
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
