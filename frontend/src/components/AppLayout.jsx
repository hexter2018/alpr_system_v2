import React, { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3, Upload, ListChecks, Database, FileText, Camera, Heart,
  Shield, Search, Sun, Moon, PanelLeftClose, PanelLeft, Menu, X
} from 'lucide-react'

/* ===== THEME CONTEXT ===== */
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('alpr-theme') || 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('alpr-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/* ===== NAV CONFIG ===== */
const navGroups = [
  {
    label: 'Monitor',
    items: [
      { to: '/', label: 'Dashboard', icon: BarChart3 },
      { to: '/queue', label: 'Verification', icon: ListChecks },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/reports', label: 'Reports', icon: FileText },
      { to: '/master', label: 'Master DB', icon: Database },
      { to: '/search', label: 'Search', icon: Search },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/cameras', label: 'Cameras', icon: Camera },
      { to: '/watchlist', label: 'Watchlist', icon: Shield },
      { to: '/upload', label: 'Upload', icon: Upload },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/health', label: 'Health', icon: Heart },
    ],
  },
]

/* ===== SIDEBAR ===== */
function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar bg-gradient-to-b from-sidebar via-sidebar to-black/20">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.08]">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="3" />
            <path d="M7 12h2M15 12h2M11 10v4" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-sidebar-content truncate tracking-tight">ALPR System</h1>
            <p className="text-[11px] text-sidebar-content-secondary truncate">License Plate Recognition</p>
          </div>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] uppercase tracking-widest font-semibold text-sidebar-content-secondary">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onMobileClose}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative
                      ${isActive
                        ? 'bg-gradient-to-r from-blue-600/90 to-blue-700/90 text-white shadow-md shadow-blue-900/30 ring-1 ring-white/10'
                        : 'text-sidebar-content-secondary hover:bg-white/[0.06] hover:text-sidebar-content'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'drop-shadow-sm' : ''}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {isActive && !collapsed && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Controls */}
      <div className="border-t border-white/[0.08] p-3 space-y-1">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-content-secondary hover:bg-sidebar-hover hover:text-sidebar-content transition-all"
          title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Collapse Toggle (desktop only) */}
        <button
          onClick={onToggle}
          className="hidden lg:flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-content-secondary hover:bg-sidebar-hover hover:text-sidebar-content transition-all"
        >
          {collapsed
            ? <PanelLeft className="w-5 h-5 flex-shrink-0" />
            : <PanelLeftClose className="w-5 h-5 flex-shrink-0" />
          }
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[240px]'}`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-[260px] animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}

/* ===== MAIN LAYOUT ===== */
function LayoutInner() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('alpr-sidebar-collapsed') === 'true'
    }
    return false
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem('alpr-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const toggleCollapse = useCallback(() => setCollapsed((p) => !p), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />

      {/* Main content area */}
      <div className={`transition-all duration-300 ${collapsed ? 'lg:ml-[68px]' : 'lg:ml-[240px]'}`}>
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-xl text-content-secondary hover:bg-surface-overlay transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-xs">
              LP
            </div>
            <span className="text-sm font-semibold text-content">ALPR System</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ===== APP LAYOUT WRAPPER ===== */
export default function AppLayout() {
  return (
    <ThemeProvider>
      <LayoutInner />
    </ThemeProvider>
  )
}
