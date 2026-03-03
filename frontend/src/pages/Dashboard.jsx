import React, { useEffect, useState, useRef, useCallback } from 'react'
import { getKPI } from '../lib/api.js'
import createGlobe from 'cobe'
import { 
  Activity,
  Database,
  CheckCircle2,
  Clock,
  Camera,
  Shield,
  AlertCircle,
  ChevronRight,
  Settings,
  Bell,
  Search,
  Home,
  Layers,
  FolderOpen,
  BookOpen,
  Users,
  HelpCircle,
  Plus,
  Download,
  Cpu,
  Zap,
  Target,
  Eye,
  Menu,
  X,
  TrendingUp,
  Radio
} from 'lucide-react'

/* ===== MINI SPARKLINE COMPONENT ===== */
function Sparkline({ data, color = '#10b981', height = 32 }) {
  if (!data || data.length === 0) return null
  
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const width = 80
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

/* ===== INTERACTIVE GLOBE COMPONENT ===== */
function Globe() {
  const canvasRef = useRef(null)
  const pointerInteracting = useRef(null)
  const pointerInteractionMovement = useRef(0)
  const phiRef = useRef(0)

  useEffect(() => {
    let width = 0
    let globe

    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth
      }
    }
    
    window.addEventListener('resize', onResize)
    onResize()

    if (canvasRef.current) {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.3,
        dark: 1,
        diffuse: 3,
        mapSamples: 16000,
        mapBrightness: 1.2,
        baseColor: [0.1, 0.1, 0.1],
        markerColor: [0.1, 0.8, 0.5],
        glowColor: [0.05, 0.2, 0.15],
        markers: [
          // ALPR surveillance network nodes - emerald highlights
          { location: [13.7563, 100.5018], size: 0.08 }, // Bangkok
          { location: [18.7883, 98.9853], size: 0.06 },  // Chiang Mai
          { location: [7.8804, 98.3923], size: 0.05 },   // Phuket
          { location: [12.9236, 100.8825], size: 0.06 }, // Pattaya
          { location: [14.9965, 102.1], size: 0.05 },    // Nakhon Ratchasima
          { location: [16.4419, 102.8360], size: 0.05 }, // Khon Kaen
        ],
        onRender: (state) => {
          if (!pointerInteracting.current) {
            phiRef.current += 0.003
          }
          state.phi = phiRef.current + pointerInteractionMovement.current
          state.width = width * 2
          state.height = width * 2
        }
      })
    }

    return () => {
      if (globe) globe.destroy()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="relative w-full aspect-square max-w-[500px] mx-auto">
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 blur-3xl" />
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX - pointerInteractionMovement.current
          canvasRef.current.style.cursor = 'grabbing'
        }}
        onPointerUp={() => {
          pointerInteracting.current = null
          canvasRef.current.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          pointerInteracting.current = null
          canvasRef.current.style.cursor = 'grab'
        }}
        onMouseMove={(e) => {
          if (pointerInteracting.current !== null) {
            const delta = e.clientX - pointerInteracting.current
            pointerInteractionMovement.current = delta * 0.005
          }
        }}
        onTouchMove={(e) => {
          if (pointerInteracting.current !== null && e.touches[0]) {
            const delta = e.touches[0].clientX - pointerInteracting.current
            pointerInteractionMovement.current = delta * 0.005
          }
        }}
      />
    </div>
  )
}

/* ===== LIVE STATUS BEACON ===== */
function LiveBeacon({ status = 'online' }) {
  const isOnline = status === 'online'
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <span className={`absolute inset-0 rounded-full animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-red-400'} opacity-75`} />
        <span className={`relative block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </div>
      <span className={`text-xs font-medium uppercase tracking-wider ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
        {isOnline ? 'Live' : 'Offline'}
      </span>
    </div>
  )
}

/* ===== GLASS CARD COMPONENT ===== */
function GlassCard({ children, className = '', hover = true }) {
  return (
    <div className={`
      relative overflow-hidden rounded-2xl 
      border border-white/[0.08] 
      bg-white/[0.02] backdrop-blur-xl
      ${hover ? 'hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300' : ''}
      ${className}
    `}>
      {children}
    </div>
  )
}

/* ===== SIDEBAR NAVIGATION ===== */
function Sidebar() {
  const navItems = [
    { icon: Home, label: 'Dashboard', active: true },
    { icon: Layers, label: 'Cameras', count: 12 },
    { icon: FolderOpen, label: 'Records' },
    { icon: Database, label: 'Master DB', count: 4 },
    { icon: BookOpen, label: 'Reports' },
    { icon: Users, label: 'Team' },
    { icon: HelpCircle, label: 'Support' },
  ]

  return (
    <aside className="hidden lg:flex flex-col w-72 bg-[#09090b] border-r border-white/[0.06] h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/[0.06]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Camera className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-white tracking-tight">ALPR System</h1>
          <p className="text-xs text-zinc-500">Enterprise Suite</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input 
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 bg-white/[0.05] rounded border border-white/[0.08]">
            /
          </kbd>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              item.active 
                ? 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className={`w-5 h-5 ${item.active ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span>{item.label}</span>
            </div>
            {item.count && (
              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                item.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.05] text-zinc-500'
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-white/[0.06]">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all">
          <Settings className="w-5 h-5 text-zinc-500" />
          <span>Settings</span>
        </button>
      </div>

      {/* User */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-semibold text-sm">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Admin User</p>
            <p className="text-xs text-zinc-500 truncate">Enterprise Plan</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ===== TOP HEADER ===== */
function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-20">
      <div className="flex items-center justify-between px-4 md:px-6 py-4">
        {/* Mobile Menu Button & Logo */}
        <div className="flex lg:hidden items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-zinc-400" /> : <Menu className="w-5 h-5 text-zinc-400" />}
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-semibold text-white">ALPR</h1>
        </div>

        {/* Status - Desktop */}
        <div className="hidden lg:flex items-center gap-6">
          <LiveBeacon status="online" />
          <div className="h-4 w-px bg-white/10" />
          <span className="text-sm text-zinc-400">
            Last sync: <span className="text-zinc-300">Just now</span>
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <button className="hidden sm:flex items-center gap-2 px-4 py-2 border border-white/[0.08] rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Scan</span>
          </button>
          <button className="relative p-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] rounded-xl transition-all">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-[#09090b]" />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/[0.06] bg-[#09090b] p-4">
          <div className="flex items-center gap-2 mb-4">
            <LiveBeacon status="online" />
          </div>
          <nav className="space-y-1">
            {['Dashboard', 'Cameras', 'Records', 'Reports', 'Analytics'].map((tab, i) => (
              <button
                key={tab}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  i === 0 
                    ? 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'text-zinc-400 hover:bg-white/[0.03]'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

/* ===== KPI WIDGET ===== */
function KPIWidget({ icon: Icon, label, value, trend, trendUp, sparkData, color = 'emerald' }) {
  const colorClasses = {
    emerald: {
      bg: 'from-emerald-500/20 to-emerald-500/5',
      icon: 'text-emerald-400',
      border: 'border-emerald-500/20',
      glow: 'shadow-emerald-500/10'
    },
    cyan: {
      bg: 'from-cyan-500/20 to-cyan-500/5',
      icon: 'text-cyan-400',
      border: 'border-cyan-500/20',
      glow: 'shadow-cyan-500/10'
    },
    amber: {
      bg: 'from-amber-500/20 to-amber-500/5',
      icon: 'text-amber-400',
      border: 'border-amber-500/20',
      glow: 'shadow-amber-500/10'
    },
    violet: {
      bg: 'from-violet-500/20 to-violet-500/5',
      icon: 'text-violet-400',
      border: 'border-violet-500/20',
      glow: 'shadow-violet-500/10'
    }
  }

  const c = colorClasses[color]

  return (
    <GlassCard className={`p-5 ${c.glow} shadow-xl`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${c.icon}`} />
        </div>
        {sparkData && <Sparkline data={sparkData} color={color === 'emerald' ? '#10b981' : color === 'cyan' ? '#06b6d4' : color === 'amber' ? '#f59e0b' : '#8b5cf6'} />}
      </div>
      <h3 className="text-3xl font-bold text-white tracking-tight mb-1">{value}</h3>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{label}</p>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
            <TrendingUp className={`w-3 h-3 ${!trendUp && 'rotate-180'}`} />
            {trend}
          </span>
        )}
      </div>
    </GlassCard>
  )
}

/* ===== SYSTEM STATUS CARD ===== */
function SystemStatusCard() {
  const metrics = [
    { icon: Cpu, label: 'CPU', value: '45%', color: 'emerald' },
    { icon: Target, label: 'Throughput', value: '125/m', color: 'cyan' },
    { icon: Shield, label: 'Uptime', value: '99.8%', color: 'emerald' },
    { icon: Camera, label: 'Cameras', value: '12/12', color: 'emerald' },
  ]

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">System Status</h3>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400">All Systems Operational</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="text-center p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.05] to-transparent border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
              <metric.icon className={`w-5 h-5 ${metric.color === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'}`} />
            </div>
            <p className="text-lg font-bold text-white">{metric.value}</p>
            <p className="text-xs text-zinc-500">{metric.label}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/* ===== AI PERFORMANCE CARD ===== */
function AIPerformanceCard({ kpi }) {
  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? ((kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100).toFixed(1)
    : 0

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">AI Performance</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          accuracy >= 90 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
            : accuracy >= 75 
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Review'}
        </span>
      </div>

      <div className="flex items-center gap-6 mb-6">
        {/* Circular Progress */}
        <div className="relative">
          <svg className="w-24 h-24 -rotate-90">
            <circle
              className="text-white/[0.05]"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
              r="40"
              cx="48"
              cy="48"
            />
            <circle
              className="text-emerald-500"
              strokeWidth="8"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="40"
              cx="48"
              cy="48"
              style={{
                strokeDasharray: `${2 * Math.PI * 40}`,
                strokeDashoffset: `${2 * Math.PI * 40 * (1 - accuracy / 100)}`,
                transition: 'stroke-dashoffset 1s ease-out',
                filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))'
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{accuracy}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-zinc-400 mb-2">Recognition Accuracy</p>
          <p className="text-xs text-zinc-600">Based on {(kpi.alpr_total + kpi.mlpr_total).toLocaleString()} samples</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <p className="text-xs text-emerald-400 font-medium mb-1">ALPR Correct</p>
          <p className="text-xl font-bold text-white">{kpi.alpr_total.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <p className="text-xs text-amber-400 font-medium mb-1">MLPR Corrected</p>
          <p className="text-xl font-bold text-white">{kpi.mlpr_total.toLocaleString()}</p>
        </div>
      </div>
    </GlassCard>
  )
}

/* ===== MASTER DATABASE CARD ===== */
function MasterDatabaseCard({ kpi }) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Master Database</h3>
        <button className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
          View All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-6 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/20 flex items-center justify-center">
          <Database className="w-8 h-8 text-cyan-400" />
        </div>
        <div>
          <p className="text-4xl font-bold text-white tracking-tight">{kpi.master_total.toLocaleString()}</p>
          <p className="text-sm text-zinc-500">Total Records</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-sm text-zinc-300">Auto-Master</span>
          </div>
          <span className="text-sm font-semibold text-white">{kpi.auto_master.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Eye className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-sm text-zinc-300">Manual Entry</span>
          </div>
          <span className="text-sm font-semibold text-white">{(kpi.master_total - kpi.auto_master).toLocaleString()}</span>
        </div>
      </div>
    </GlassCard>
  )
}

/* ===== GLOBE HERO SECTION ===== */
function GlobeHero({ kpi }) {
  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? ((kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100).toFixed(1)
    : 0

  return (
    <GlassCard className="relative overflow-hidden p-6 md:p-8 lg:col-span-2" hover={false}>
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-cyan-500/[0.07]" />
      
      <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8">
        {/* Content */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Live Network</span>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight text-balance">
            ALPR Command Center
          </h2>
          <p className="text-zinc-400 max-w-md mb-8 text-balance">
            Real-time license plate recognition with <span className="text-emerald-400 font-semibold">{accuracy}%</span> AI accuracy. 
            Monitor surveillance networks globally.
          </p>

          <div className="flex flex-wrap justify-center lg:justify-start gap-3">
            <button className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all">
              View Analytics
            </button>
            <button className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06] transition-all">
              Camera Setup
            </button>
          </div>
        </div>

        {/* Globe */}
        <div className="flex-shrink-0 w-full max-w-[280px] lg:max-w-[320px]">
          <Globe />
        </div>
      </div>

      {/* Floating stats */}
      <div className="hidden lg:block absolute bottom-6 right-6">
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-black/40 backdrop-blur border border-white/[0.08]">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{kpi.total_reads.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">Total Scans</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-400">6</p>
            <p className="text-xs text-zinc-500">Active Nodes</p>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

/* ===== LOADING STATE ===== */
function LoadingState() {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 animate-ping opacity-30" />
        </div>
        <p className="text-zinc-500 text-sm">Initializing ALPR System...</p>
      </div>
    </div>
  )
}

/* ===== ERROR STATE ===== */
function ErrorState({ error }) {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <GlassCard className="p-6 max-w-md border-red-500/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Connection Error</h3>
            <p className="text-sm text-zinc-400">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 border border-red-500/20 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

/* ===== MAIN DASHBOARD ===== */
export default function Dashboard() {
  const [kpi, setKpi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Generate sparkline mock data based on real KPI values
  const generateSparkData = useCallback((baseValue) => {
    return Array.from({ length: 7 }, () => 
      Math.floor(baseValue * (0.85 + Math.random() * 0.3))
    )
  }, [])

  useEffect(() => {
    const fetchKPI = async () => {
      setLoading(true)
      try {
        const data = await getKPI()
        setKpi(data)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    
    fetchKPI()
    const interval = setInterval(fetchKPI, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} />
  if (!kpi) return null

  return (
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header />

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {/* Bento Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            
            {/* Globe Hero - Spans 2 columns */}
            <GlobeHero kpi={kpi} />
            
            {/* AI Performance */}
            <AIPerformanceCard kpi={kpi} />
            
            {/* KPI Widgets Row */}
            <KPIWidget 
              icon={Activity} 
              label="Total Scans" 
              value={kpi.total_reads.toLocaleString()}
              trend="+12.5%"
              trendUp={true}
              sparkData={generateSparkData(kpi.total_reads / 7)}
              color="emerald"
            />
            <KPIWidget 
              icon={CheckCircle2} 
              label="Verified" 
              value={kpi.verified.toLocaleString()}
              trend="+8.2%"
              trendUp={true}
              sparkData={generateSparkData(kpi.verified / 7)}
              color="cyan"
            />
            <KPIWidget 
              icon={Clock} 
              label="Pending Review" 
              value={kpi.pending.toLocaleString()}
              trend="-3.1%"
              trendUp={false}
              sparkData={generateSparkData(kpi.pending / 7)}
              color="amber"
            />
            
            {/* Master Database Card */}
            <MasterDatabaseCard kpi={kpi} />
            
            {/* System Status - Spans 2 columns */}
            <div className="lg:col-span-2">
              <SystemStatusCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
