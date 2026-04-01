import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
  disabled?: boolean
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
}

export function CustomSelect({ value, onChange, options, className, disabled, placeholder, searchable }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    if (!open) { setSearch(''); return }
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open, searchable])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'flex items-center w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <span className={cn('flex-1 text-left', !value && 'text-slate-500')}>
          {selected?.label ?? value ?? placeholder ?? ''}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-slate-700">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 rounded-md border border-slate-700 bg-slate-800 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results</p>
            ) : filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (!opt.disabled) { onChange(opt.value); setOpen(false) } }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-sm text-left transition-colors',
                  opt.disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : opt.value === value
                      ? 'bg-blue-900/40 text-blue-300'
                      : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
