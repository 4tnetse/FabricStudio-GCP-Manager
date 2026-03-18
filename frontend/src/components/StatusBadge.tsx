import { cn } from '@/lib/utils'
import type { Instance } from '@/lib/types'

type Status = Instance['status']

const statusConfig: Record<Status, { label: string; className: string }> = {
  RUNNING:      { label: 'Running',      className: 'text-green-400' },
  TERMINATED:   { label: 'Terminated',   className: 'text-slate-400' },
  STAGING:      { label: 'Staging',      className: 'text-blue-400' },
  PROVISIONING: { label: 'Provisioning', className: 'text-blue-400' },
  STOPPING:     { label: 'Stopping',     className: 'text-yellow-400' },
  UNKNOWN:      { label: 'Unknown',      className: 'text-red-400' },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.UNKNOWN
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  )
}
