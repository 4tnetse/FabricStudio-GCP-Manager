import type { ElementType } from 'react'
import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { apiGet } from '@/api/client'
import {
  LayoutDashboard,
  Hammer,
  Copy,
  Shield,
  Tag,
  Terminal,
  HardDrive,
  FileCode,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectSelector } from '@/components/ProjectSelector'
import { useTheme } from '@/context/ThemeContext'

import Dashboard from '@/pages/Dashboard'
import Build from '@/pages/Build'
import Clone from '@/pages/Clone'
import Firewall from '@/pages/Firewall'
import Labels from '@/pages/Labels'
import SSH from '@/pages/SSH'
import Images from '@/pages/Images'
import Configurations from '@/pages/Configurations'
import SettingsPage from '@/pages/Settings'

const NAV_ITEMS = [
  { to: '/', label: 'Instances', icon: LayoutDashboard, exact: true },
  { to: '/clone', label: 'Clone', icon: Copy },
  { to: '/firewall', label: 'Firewall', icon: Shield },
  { to: '/labels', label: 'Labels', icon: Tag },
  { to: '/configurations', label: 'Configurations', icon: FileCode },
  { to: '/ssh', label: 'SSH', icon: Terminal },
  { to: '/build', label: 'Build', icon: Hammer },
  { to: '/images', label: 'Images', icon: HardDrive },
]

function SidebarLink({
  to,
  label,
  icon: Icon,
  exact,
}: {
  to: string
  label: string
  icon: ElementType
  exact?: boolean
}) {
  const location = useLocation()
  const { theme } = useTheme()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
  const isSF = theme === 'security-fabric'

  return (
    <NavLink
      to={to}
      end={exact}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group',
        isActive
          ? isSF ? 'bg-[#db291c] text-white font-bold' : 'bg-slate-700 text-slate-100 font-bold'
          : isSF ? 'text-slate-300 hover:text-white hover:bg-[#505c66]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', isActive ? (isSF ? 'text-white' : 'text-blue-400') : (isSF ? 'text-slate-400 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-400'))} />
      <span>{label}</span>
      {isActive && <ChevronRight className={cn('w-3.5 h-3.5 ml-auto', isSF ? 'text-white/60' : 'text-slate-500')} />}
    </NavLink>
  )
}

export default function App() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<{ version: string }>('/health'),
    staleTime: Infinity,
  })

  const [sidebarWidth, setSidebarWidth] = useState(224) // 14rem = w-56
  const dragging = useRef(false)

  const onMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const maxWidth = window.innerWidth / 4
      const newWidth = Math.min(Math.max(e.clientX, 160), maxWidth)
      setSidebarWidth(newWidth)
    }

    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        style={{ width: sidebarWidth, backgroundColor: isSF ? '#292e34' : undefined, borderColor: isSF ? '#3d3d3d' : undefined }}
        className="shrink-0 flex flex-col border-r border-slate-800 bg-slate-900"
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-800" style={isSF ? { borderColor: '#3d3d3d' } : undefined}>
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-label="fabric-studio icon" className={cn('w-7 h-7 shrink-0', isSF ? '' : 'text-slate-100')} fill="currentColor">
              <g transform="matrix(1.86193 0 0 1.86193 -2134.636 -12994.814)">
                <circle cx="1151.6" cy="6983.5" r=".1"/>
                <circle cx="1151.5" cy="6982.6" r=".1"/>
                <circle cx="1152.5" cy="6983.1" r=".1"/>
                <circle cx="1151.7" cy="6984.5" r=".1"/>
                <path d="m1151.5 6982.8-1.1 1.9c.1 0 .2.1.2.1l.7-1.2v-.1c0-.1 0-.3.2-.3h.1l.8-1.4c-.1-.1-.1-.1-.2-.1l-.4.7c0 .3-.1.4-.3.4zM1152.4 6982.9l.4-.6c-.1-.1-.1-.2-.2-.2l-.8 1.4c0 .1 0 .3-.2.3l-.7 1.2h.3l.2-.4c0-.1 0-.3.2-.3l.6-1c0-.2 0-.4.2-.4zM1151.3 6982.7c-.1-.1-.1-.3.1-.4h.2l.4-.7c-.9-.3-1.9.1-2.2 1-.3.7 0 1.5.5 2l1-1.9zM1152.7 6983c.1.2 0 .4-.1.4h-.1l-.5.9v.1c0 .1 0 .3-.2.3h-.1l-.1.2c1-.1 1.6-1 1.5-2 0-.2-.1-.3-.1-.5l-.3.6z"/>
              </g>
              <path d="M15.667 1.889H2.333C1.623 1.889 1 2.51 1 3.222v8.89c0 .71.622 1.332 1.333 1.332h5.334l-.445 1.334H5.178c-.356 0-.711.266-.711.622.089.444.355.711.71.711h7.556a.608.608 0 0 0 .623-.622.608.608 0 0 0-.623-.622h-1.955l-.445-1.423h5.334c.71 0 1.333-.622 1.333-1.333V3.222c0-.71-.622-1.333-1.333-1.333zm-.445 9.778H2.778v-8h12.444v8z"/>
            </svg>
            <div>
              <div className={cn('font-semibold leading-tight text-sm tracking-widest uppercase', isSF ? '' : 'text-slate-100')}>
                Fabric Studio
              </div>
              <div className={cn('text-xs', isSF ? '' : 'text-slate-500')}>GCP Manager</div>
            </div>
          </div>
        </div>

        {/* Project selector */}
        <div className="py-3 border-b border-slate-800" style={isSF ? { borderColor: '#3d3d3d' } : undefined}>
          <ProjectSelector />
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* Settings at bottom */}
        <div className="px-3 py-3 border-b border-slate-800" style={isSF ? { borderColor: '#3d3d3d' } : undefined}>
          <SidebarLink to="/settings" label="Settings" icon={Settings} />
        </div>

        {/* Version */}
        <button
          onClick={() => setAboutOpen(true)}
          className="px-4 py-2.5 text-xs text-slate-600 hover:text-slate-400 transition-colors text-left select-none"
        >
          v{health?.version ?? '…'}
        </button>
      </aside>

      {/* About dialog */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 shrink-0 text-[#db291c]" fill="currentColor">
                <g transform="matrix(1.86193 0 0 1.86193 -2134.636 -12994.814)">
                  <circle cx="1151.6" cy="6983.5" r=".1"/>
                  <circle cx="1151.5" cy="6982.6" r=".1"/>
                  <circle cx="1152.5" cy="6983.1" r=".1"/>
                  <circle cx="1151.7" cy="6984.5" r=".1"/>
                  <path d="m1151.5 6982.8-1.1 1.9c.1 0 .2.1.2.1l.7-1.2v-.1c0-.1 0-.3.2-.3h.1l.8-1.4c-.1-.1-.1-.1-.2-.1l-.4.7c0 .3-.1.4-.3.4zM1152.4 6982.9l.4-.6c-.1-.1-.1-.2-.2-.2l-.8 1.4c0 .1 0 .3-.2.3l-.7 1.2h.3l.2-.4c0-.1 0-.3.2-.3l.6-1c0-.2 0-.4.2-.4zM1151.3 6982.7c-.1-.1-.1-.3.1-.4h.2l.4-.7c-.9-.3-1.9.1-2.2 1-.3.7 0 1.5.5 2l1-1.9zM1152.7 6983c.1.2 0 .4-.1.4h-.1l-.5.9v.1c0 .1 0 .3-.2.3h-.1l-.1.2c1-.1 1.6-1 1.5-2 0-.2-.1-.3-.1-.5l-.3.6z"/>
                </g>
                <path d="M15.667 1.889H2.333C1.623 1.889 1 2.51 1 3.222v8.89c0 .71.622 1.332 1.333 1.332h5.334l-.445 1.334H5.178c-.356 0-.711.266-.711.622.089.444.355.711.71.711h7.556a.608.608 0 0 0 .623-.622.608.608 0 0 0-.623-.622h-1.955l-.445-1.423h5.334c.71 0 1.333-.622 1.333-1.333V3.222c0-.71-.622-1.333-1.333-1.333zm-.445 9.778H2.778v-8h12.444v8z"/>
              </svg>
              <div>
                <h2 className="text-base font-semibold text-slate-100">Fabric Studio GCP Manager</h2>
                <p className="text-sm text-slate-400">Version {health?.version ?? '…'}</p>
              </div>
            </div>

            <hr className="border-slate-700" />

            <div className="space-y-1 text-sm text-slate-300">
              <p>Created by <span className="font-medium text-slate-100">Tijl Vermant</span></p>
              <p>
                <a
                  href="https://github.com/4tnetse/FabricStudio-GCP-Manager/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                >
                  github.com/4tnetse/FabricStudio-GCP-Manager
                </a>
              </p>
            </div>

            <hr className="border-slate-700" />

            <div className="space-y-1 text-sm text-slate-400">
              <p>Inspired by <span className="italic">FabricStudio-Toolkit-for-GCP</span></p>
              <p>by <span className="text-slate-300">Ferry Kemps</span></p>
              <p>
                <a
                  href="https://github.com/fkemps/FabricStudio-Toolkit-for-GCP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                >
                  github.com/fkemps/FabricStudio-Toolkit-for-GCP
                </a>
              </p>
            </div>

            <button
              onClick={() => setAboutOpen(false)}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className={cn('w-1 shrink-0 cursor-col-resize transition-colors', isSF ? 'bg-[#3d3d3d] hover:bg-[#db291c]' : 'bg-slate-800 hover:bg-blue-600')}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/build" element={<Build />} />
            <Route path="/clone" element={<Clone />} />
            <Route path="/firewall" element={<Firewall />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/ssh" element={<SSH />} />
            <Route path="/images" element={<Images />} />
            <Route path="/configurations" element={<Configurations />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
