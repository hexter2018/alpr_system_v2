import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Upload,
  ListChecks,
  Database,
  FileBarChart,
  Video,
  HeartPulse,
  ShieldAlert,
  Search,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/queue', label: 'Verification', icon: ListChecks },
  { to: '/master', label: 'Master', icon: Database },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/cameras', label: 'Cameras', icon: Video },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/watchlist', label: 'Watchlist', icon: ShieldAlert },
  { to: '/search', label: 'Search', icon: Search },
]

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-black">
      {/* Subtle ambient background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 -left-24 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute -bottom-48 -right-24 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
      </div>

      <div className="mx-auto max-w-[1440px] space-y-4 p-4 lg:space-y-5 lg:p-6">
        {/* Header */}
        <header className="glass-panel px-4 py-3 md:px-5 md:py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-sm font-bold text-black shadow-lg shadow-emerald-500/20">
                  TL
                </div>
                <div>
                  <h1 className="text-base font-semibold text-white">Thai ALPR</h1>
                  <p className="text-[11px] text-zinc-500">License Plate Recognition System</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[11px] font-medium text-zinc-400">System Online</span>
              </div>
            </div>

            <nav className="top-nav flex flex-wrap items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'nav-item-idle'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="glass-panel overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
