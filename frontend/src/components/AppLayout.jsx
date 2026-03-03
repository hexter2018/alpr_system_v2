import React, { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Upload,
  ListChecks,
  Database,
  FileBarChart,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Activity,
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext.jsx'

const SIDEBAR_KEY = 'alpr_sidebar_collapsed'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/queue', label: 'Verification', icon: ListChecks },
  { to: '/master', label: 'Master DB', icon: Database },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/monitor', label: 'System Health', icon: Activity },
]

export default function AppLayout() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return true
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  /* auto-collapse on resize below 1024 */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e) => {
      if (e.matches) setCollapsed(true)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className={`flex h-screen overflow-hidden ${theme === 'light' ? 'bg-gray-50' : 'bg-slate-950'}`}>
      {/* ── Sidebar ── */}
      <aside
        className={`sidebar flex-shrink-0 ${
          collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b ${theme === 'light' ? 'border-slate-200' : 'border-white/[0.06]'}`}>
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-blue-600 text-xs font-bold text-white">
            LP
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className={`text-sm font-semibold whitespace-nowrap ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                Thai ALPR
              </p>
              <p className={`text-[10px] whitespace-nowrap ${theme === 'light' ? 'text-slate-500' : 'text-slate-500'}`}>
                License Plate System
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `sidebar-item ${
                  isActive ? 'sidebar-item-active' : 'sidebar-item-idle'
                } ${collapsed ? 'justify-center px-0' : ''}`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Theme Toggle + Collapse */}
        <div className={`border-t p-2 space-y-1 ${theme === 'light' ? 'border-slate-200' : 'border-white/[0.06]'}`}>
          <button
            onClick={toggleTheme}
            className={`sidebar-item sidebar-item-idle w-full ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-[18px] w-[18px]" />
                {!collapsed && <span className="truncate">Light Mode</span>}
              </>
            ) : (
              <>
                <Moon className="h-[18px] w-[18px]" />
                {!collapsed && <span className="truncate">Dark Mode</span>}
              </>
            )}
          </button>
          <button
            onClick={toggle}
            className={`sidebar-item sidebar-item-idle w-full ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span className="truncate">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Page body */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
