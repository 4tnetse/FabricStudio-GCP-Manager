import type { ElementType } from 'react'
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { apiGet, apiPost } from '@/api/client'
import { useProjects } from '@/api/projects'
import { useDeployStream } from '@/api/cloudrun'
import {
  LayoutDashboard,
  Hammer,
  Copy,
  Wrench,
  Shield,
  Tag,
  Terminal,
  HardDrive,
  FileCode,
  Receipt,
  Settings,
  ChevronRight,
  BookOpen,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectSelector } from '@/components/ProjectSelector'
import { useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/api/settings'
import { useBuild } from '@/context/BuildContext'
import { useImport } from '@/context/ImportContext'
import { useOps } from '@/context/OpsContext'

import Dashboard from '@/pages/Dashboard'
import Build from '@/pages/Build'
import Clone from '@/pages/Clone'
import Configure from '@/pages/Configure'
import Firewall from '@/pages/Firewall'
import Labels from '@/pages/Labels'
import SSH from '@/pages/SSH'
import Images from '@/pages/Images'
import Configurations from '@/pages/Configurations'
import SettingsPage from '@/pages/Settings'
import Costs from '@/pages/Costs'
import Schedules from '@/pages/Schedules'

const NAV_ITEMS = [
  { to: '/', label: 'Instances', icon: LayoutDashboard, exact: true },
  { to: '/build', label: 'Build', icon: Hammer },
  { to: '/configure', label: 'Configure', icon: Wrench },
  { to: '/clone', label: 'Clone', icon: Copy },
  { to: '/firewall', label: 'Firewall', icon: Shield },
  { to: '/labels', label: 'Labels', icon: Tag },
  { to: '/ssh', label: 'SSH', icon: Terminal },
  { to: '/configurations', label: 'SSH Configurations', icon: FileCode },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/images', label: 'Images', icon: HardDrive },
  { to: '/costs', label: 'Costs', icon: Receipt },
]

function SidebarLink({
  to,
  label,
  icon: Icon,
  exact,
  disabled,
}: {
  to: string
  label: string
  icon: ElementType
  exact?: boolean
  disabled?: boolean
}) {
  const location = useLocation()
  const { theme } = useTheme()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
  const isSF = theme === 'security-fabric'

  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-30 cursor-not-allowed select-none">
        <Icon className="w-4 h-4 shrink-0 text-slate-500" />
        <span className="text-slate-500">{label}</span>
      </div>
    )
  }

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
      {isActive ? <ChevronRight className={cn('w-3.5 h-3.5 ml-auto', isSF ? 'text-white/60' : 'text-slate-500')} /> : null}
    </NavLink>
  )
}

function NavActivityWrapper({ to, children }: { to: string; children: React.ReactNode }) {
  const { buildJob } = useBuild()
  const { importJob } = useImport()
  const { configure, clone, ssh } = useOps()
  const location = useLocation()
  const onThisPage = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
  const buildActive = to === '/build' && buildJob?.phase === 'building'
  const importActive = to === '/images' && importJob && (importJob.phase === 'uploading' || importJob.phase === 'importing')
  const configureActive = to === '/configure' && configure.isStreaming
  const cloneActive = to === '/clone' && clone.isStreaming
  const sshActive = to === '/ssh' && ssh.isStreaming
  const showSpinner = (buildActive || importActive || configureActive || cloneActive || sshActive) && !onThisPage
  if (!showSpinner) return <>{children}</>
  return (
    <div className="relative">
      {children}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
      </span>
    </div>
  )
}

function versionGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va > vb
  }
  return false
}

export default function App() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<{ version: string }>('/health'),
    staleTime: Infinity,
  })

  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: () => apiGet<{ local_version: string; remote_version: string | null; remote_configured: boolean; latest_version: string | null; update_available: boolean }>('/version'),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const queryClient = useQueryClient()
  const [upgradeStreamUrl, setUpgradeStreamUrl] = useState<string | null>(null)
  const upgradeRemote = useMutation({
    mutationFn: () => apiPost<{ upgrade_id: string }>('/version/upgrade-remote'),
    onSuccess: (data) => {
      setUpgradeStreamUrl(`/api/version/upgrade-remote/${data.upgrade_id}/stream`)
    },
  })

  const { lines: upgradeLines, isStreaming: upgradeStreaming, failed: upgradeFailed } =
    useDeployStream(upgradeStreamUrl, () => {})

  useEffect(() => {
    if (upgradeStreamUrl && !upgradeStreaming && !upgradeFailed && upgradeLines.length > 0) {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['version'] }), 2000)
    }
  }, [upgradeStreamUrl, upgradeStreaming, upgradeFailed, upgradeLines.length])

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

  const { data: settings } = useSettings()
  const hasKey = !!settings?.has_keys

  const { data: projects } = useProjects()
  const currentProject = projects?.find((p) => p.is_selected) ?? projects?.[0]
  const projectLabel = currentProject?.name ?? currentProject?.id ?? ''

  useEffect(() => {
    if (!projectLabel) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.font = '500 14px Inter, system-ui, -apple-system, sans-serif'
    const textWidth = ctx.measureText(projectLabel).width
    // pl-6(24) + icon(16) + gap(8) + text + gap(8) + chevron(14) + pr-3(12) + breathing room(12)
    const needed = Math.ceil(textWidth) + 94
    setSidebarWidth(Math.max(224, needed))
  }, [projectLabel])

  const { theme } = useTheme()
  const isSF = theme === 'security-fabric'
  const [aboutOpen, setAboutOpen] = useState(false)

  const isUpgrading = upgradeRemote.isPending || upgradeStreaming

  type LocalStatus = 'UNINITIALIZED' | 'UP_TO_DATE' | 'OUTDATED'
  type RemoteStatus = 'UNINITIALIZED' | 'NO_REMOTE' | 'IN_SYNC' | 'LOCAL_AHEAD' | 'REMOTE_AHEAD'

  const localStatus: LocalStatus = !versionInfo
    ? 'UNINITIALIZED'
    : versionInfo.update_available
      ? 'OUTDATED'
      : 'UP_TO_DATE'

  const remoteStatus: RemoteStatus = !versionInfo
    ? 'UNINITIALIZED'
    : !versionInfo.remote_configured
      ? 'NO_REMOTE'
      : !versionInfo.remote_version
        ? 'UNINITIALIZED'
        : versionInfo.remote_version === versionInfo.local_version
          ? 'IN_SYNC'
          : versionGt(versionInfo.local_version, versionInfo.remote_version)
            ? 'LOCAL_AHEAD'
            : 'REMOTE_AHEAD'

  const githubHasVersion = !!(versionInfo?.latest_version && !versionGt(versionInfo.local_version, versionInfo.latest_version))

  useEffect(() => {
    if (!aboutOpen || isUpgrading || remoteStatus !== 'LOCAL_AHEAD') return
    queryClient.invalidateQueries({ queryKey: ['version'] })
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['version'] })
    }, 5_000)
    return () => clearInterval(interval)
  }, [aboutOpen, isUpgrading, remoteStatus])

  const mainScrollRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0)
  }, [pathname])

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
          {NAV_ITEMS.filter((item) => item.to !== '/schedules' || !!settings?.remote_scheduling_enabled).map((item) => (
            <NavActivityWrapper key={item.to} to={item.to}>
              <SidebarLink {...item} disabled={!hasKey} />
            </NavActivityWrapper>
          ))}
        </nav>

        {/* Settings + Documentation at bottom */}
        <div className="px-3 py-3 border-b border-slate-800 space-y-0.5" style={isSF ? { borderColor: '#3d3d3d' } : undefined}>
          <SidebarLink to="/settings" label="Settings" icon={Settings} />
          <a
            href="/manual"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group',
              isSF ? 'text-slate-300 hover:text-white hover:bg-[#505c66]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
            )}
          >
            <BookOpen className={cn('w-4 h-4 shrink-0', isSF ? 'text-slate-400 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-400')} />
            <span>Documentation</span>
          </a>
        </div>

        {/* Version */}
        <button
          onClick={() => setAboutOpen(true)}
          title={[
            remoteStatus !== 'NO_REMOTE' && remoteStatus !== 'UNINITIALIZED' && versionInfo?.remote_version
              ? `Remote: v${versionInfo.remote_version} — ${remoteStatus === 'IN_SYNC' ? 'in sync' : remoteStatus === 'LOCAL_AHEAD' ? 'out of sync' : 'remote ahead'}`
              : null,
            localStatus === 'OUTDATED' && versionInfo?.latest_version
              ? `v${versionInfo.latest_version} available`
              : null,
          ].filter(Boolean).join(' · ') || undefined}
          className="px-4 py-2.5 text-xs text-left select-none flex items-center gap-1.5 transition-colors hover:text-slate-400"
          style={{ color: localStatus === 'OUTDATED' ? 'white' : undefined }}
        >
          <span className={localStatus === 'OUTDATED' ? '' : 'text-slate-600'}>
            v{health?.version ?? '…'}
          </span>
          {upgradeRemote.isPending && (
            <span className="flex items-center gap-1 text-blue-400"><Loader2 className="w-3 h-3 animate-spin" />Upgrading…</span>
          )}
          {upgradeRemote.isSuccess && !upgradeRemote.isPending && (
            <span className="text-green-400">✓</span>
          )}
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            localStatus === 'UNINITIALIZED' ? 'bg-blue-400' :
            localStatus === 'UP_TO_DATE' ? 'bg-green-500' :
            'bg-orange-400'
          }`} />
          {remoteStatus !== 'NO_REMOTE' && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              remoteStatus === 'UNINITIALIZED' ? 'bg-blue-400' :
              remoteStatus === 'IN_SYNC' ? 'bg-green-500' :
              'bg-orange-400'
            }`} />
          )}
        </button>
      </aside>

      {/* About dialog */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAboutOpen(false)}>
          <div className="inline-block rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
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
                <div className="space-y-0.5 mt-0.5">
                  <p className="text-sm text-slate-400 flex items-center gap-1.5">
                    <span>Local&nbsp;&nbsp;&nbsp;v{versionInfo?.local_version ?? health?.version ?? '…'}</span>
                    {localStatus === 'OUTDATED' && (
                      <>
                        <span className="text-orange-400 text-xs">⚠ update available{versionInfo?.latest_version ? ` (v${versionInfo.latest_version})` : ''}</span>
                        <a
                          href="/manual/changelog/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          release notes →
                        </a>
                        <a
                          href="/manual/upgrade/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          how to upgrade →
                        </a>
                      </>
                    )}
                    {localStatus === 'UP_TO_DATE' && (
                      <>
                        <span className="text-green-400 text-xs">✓ up to date</span>
                        <a
                          href="/manual/changelog/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          release notes →
                        </a>
                      </>
                    )}
                  </p>
                  {versionInfo?.remote_configured && (
                    <p className="text-sm text-slate-400 flex items-center gap-1.5">
                      <span>Remote&nbsp;&nbsp;{versionInfo.remote_version ? `v${versionInfo.remote_version}` : '…'}</span>
                      {remoteStatus === 'UNINITIALIZED' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                      {remoteStatus === 'IN_SYNC' && !upgradeStreamUrl && <span className="text-green-400 text-xs">✓ in sync</span>}
                      {remoteStatus === 'REMOTE_AHEAD' && <span className="text-orange-400 text-xs">⚠ remote is ahead</span>}
                      {remoteStatus === 'LOCAL_AHEAD' && (
                        <>
                          {!upgradeStreamUrl && <span className="text-orange-400 text-xs">⚠ out of sync</span>}
                          {githubHasVersion ? (
                            <button
                              onClick={() => { setUpgradeStreamUrl(null); upgradeRemote.mutate() }}
                              disabled={upgradeRemote.isPending || upgradeStreaming || (!upgradeStreaming && !!upgradeStreamUrl && !upgradeFailed)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                            >
                              {(upgradeRemote.isPending || upgradeStreaming)
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Upgrading…</>
                                : (!upgradeStreaming && upgradeStreamUrl && !upgradeFailed)
                                ? '✓ Done'
                                : '↑ Upgrade'}
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs">No new version available</span>
                          )}
                          {upgradeFailed && <span className="text-red-400 text-xs">Failed</span>}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {upgradeStreamUrl && upgradeLines.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {upgradeStreaming && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                  <span className="text-xs font-medium text-slate-400">Upgrade log</span>
                </div>
                <div className="font-mono text-xs text-slate-300 space-y-0.5 max-h-40 overflow-y-auto">
                  {upgradeLines.map((line, i) => (
                    <div key={i} className={`break-all ${line.startsWith('✗') ? 'text-red-400' : line.startsWith('✓') ? 'text-green-400' : ''}`}>{line}</div>
                  ))}
                </div>
              </div>
            )}

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
        <div ref={mainScrollRef} className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/build" element={<Build />} />
            <Route path="/clone" element={<Clone />} />
            <Route path="/configure" element={<Configure />} />
            <Route path="/firewall" element={<Firewall />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/ssh" element={<SSH />} />
            <Route path="/images" element={<Images />} />
            <Route path="/configurations" element={<Configurations />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/settings" element={<SettingsPage key={settings?.active_project_id ?? 'no-project'} />} />
            <Route path="/costs" element={<Costs />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
