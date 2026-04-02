import { useState, useCallback, ComponentType } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import { InstanceSummaryWidget } from '@/components/dashboard/InstanceSummaryWidget'
import { CostEstimateWidget } from '@/components/dashboard/CostEstimateWidget'
import { InstanceGroupsWidget } from '@/components/dashboard/InstanceGroupsWidget'
import { LicenseServerWidget } from '@/components/dashboard/LicenseServerWidget'
import { ActiveSchedulesWidget } from '@/components/dashboard/ActiveSchedulesWidget'
import { RecentActivityWidget } from '@/components/dashboard/RecentActivityWidget'
import { ImagesWidget } from '@/components/dashboard/ImagesWidget'
import { ProjectHealthSummaryWidget } from '@/components/dashboard/ProjectHealthSummaryWidget'
import { FirewallWidget } from '@/components/dashboard/FirewallWidget'

const WIDGET_COMPONENTS: Record<string, ComponentType> = {
  instance_summary: InstanceSummaryWidget,
  cost_estimate: CostEstimateWidget,
  instance_groups: InstanceGroupsWidget,
  license_server: LicenseServerWidget,
  schedules: ActiveSchedulesWidget,
  recent_activity: RecentActivityWidget,
  images: ImagesWidget,
  project_health: ProjectHealthSummaryWidget,
  firewall: FirewallWidget,
}

const DEFAULT_ORDER = Object.keys(WIDGET_COMPONENTS)
const STORAGE_KEY = 'dashboard_widget_order'

function loadOrder(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed: string[] = JSON.parse(saved)
      const valid = parsed.filter((id) => id in WIDGET_COMPONENTS)
      const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id))
      return [...valid, ...missing]
    }
  } catch {}
  return DEFAULT_ORDER
}

function SortableWidget({ id, isDragging }: { id: string; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({ id })
  const Component = WIDGET_COMPONENTS[id]

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${isOver ? 'ring-2 ring-blue-500/40 rounded-xl' : ''}`}>
      <button
        {...listeners}
        {...attributes}
        className="absolute top-3 right-3 z-10 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300"
        tabIndex={-1}
        title="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="h-full [&>*]:h-full">
        <Component />
      </div>
    </div>
  )
}

function OverlayWidget({ id }: { id: string }) {
  const Component = WIDGET_COMPONENTS[id]
  return (
    <div className="opacity-90 rotate-1 scale-[1.02] shadow-2xl ring-2 ring-blue-500/50 rounded-xl pointer-events-none">
      <Component />
    </div>
  )
}

export default function Dashboard() {
  const [order, setOrder] = useState<string[]>(loadOrder)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const next = arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    }
  }, [])

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="page-title-row">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">Overview of your project</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {order.map((id) => (
              <SortableWidget key={id} id={id} isDragging={activeId === id} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? <OverlayWidget id={activeId} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
