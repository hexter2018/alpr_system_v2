import React, { useEffect, useState } from 'react'
import { getKPI } from '../lib/api.js'
import { 
  Activity,
  Database,
  CheckCircle2,
  Clock,
  Camera,
  Shield,
  AlertCircle,
  ChevronRight,
  Sparkles,
  BarChart3,
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
  Star,
  Cpu,
  Zap,
  Target,
  Eye
} from 'lucide-react'

/* ===== SIDEBAR NAVIGATION ===== */
function Sidebar() {
  const navItems = [
    { icon: Home, label: 'Home', active: true },
    { icon: Layers, label: 'Cameras', count: 12 },
    { icon: FolderOpen, label: 'Records' },
    { icon: Database, label: 'Master DB', count: 4 },
    { icon: BookOpen, label: 'Reports' },
    { icon: Users, label: 'Team' },
    { icon: HelpCircle, label: 'Support' },
  ]

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-100 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <Camera className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-900">ALPR System</h1>
          <p className="text-xs text-gray-400">License Recognition</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-600 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition-all"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              item.active 
                ? 'bg-emerald-50 text-emerald-700' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className={`w-5 h-5 ${item.active ? 'text-emerald-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </div>
            {item.count && (
              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                item.active ? 'bg-emerald-200 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-gray-100">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
          <Settings className="w-5 h-5 text-gray-400" />
          <span>Settings</span>
        </button>
      </div>

      {/* User */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-medium">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Admin User</p>
            <p className="text-xs text-gray-400 truncate">Pro Plan</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ===== TOP HEADER ===== */
function Header() {
  const tabs = ['Home', 'Cameras', 'Records', 'Reports', 'Analytics']

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Mobile Logo */}
        <div className="flex lg:hidden items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-semibold text-gray-900">ALPR System</h1>
        </div>

        {/* Tabs - Desktop */}
        <nav className="hidden lg:flex items-center gap-1 bg-gray-50 rounded-xl p-1">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                i === 0 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button className="hidden sm:flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl text-sm font-medium text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all">
            <Plus className="w-4 h-4" />
            <span>New Scan</span>
          </button>
          <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <div className="hidden lg:block w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-purple-500" />
        </div>
      </div>
    </header>
  )
}

/* ===== HERO BANNER ===== */
function HeroBanner({ kpi }) {
  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? ((kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100).toFixed(1)
    : 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-blue-500 p-6 md:p-8">
      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 right-20 w-40 h-40 bg-white/10 rounded-full blur-2xl translate-y-1/2" />
      <div className="absolute top-1/2 right-12 -translate-y-1/2 hidden md:block">
        <div className="relative">
          <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white/20 flex items-center justify-center">
            <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full border-4 border-white/30 flex items-center justify-center">
              <div className="w-16 h-16 lg:w-24 lg:h-24 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
              </div>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full animate-pulse" />
          <div className="absolute bottom-4 -left-4 w-3 h-3 bg-white/60 rounded-full" />
        </div>
      </div>

      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white mb-4">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          Live Monitoring
        </span>
        
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Welcome to ALPR Command Center
        </h2>
        <p className="text-white/70 text-sm md:text-base max-w-lg mb-6">
          Real-time license plate recognition with {accuracy}% AI accuracy. Monitor all cameras and manage your vehicle database efficiently.
        </p>

        <div className="flex flex-wrap gap-3">
          <button className="px-5 py-2.5 bg-white rounded-xl text-sm font-semibold text-violet-700 hover:bg-white/90 transition-all">
            View Analytics
          </button>
          <button className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl text-sm font-semibold text-white border border-white/20 hover:bg-white/30 transition-all">
            Camera Setup
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===== STAT CARD ===== */
function StatCard({ icon: Icon, iconBg, label, value, subtext, starred }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:shadow-gray-100/50 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {starred !== undefined && (
          <button className="text-gray-300 hover:text-yellow-400 transition-colors">
            <Star className={`w-5 h-5 ${starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          </button>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-1">{value}</h3>
      <p className="text-sm text-gray-500">{label}</p>
      {subtext && (
        <p className="text-xs text-gray-400 mt-2">{subtext}</p>
      )}
      <button className="w-full mt-4 py-2.5 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all group-hover:bg-violet-50 group-hover:text-violet-600">
        View Details
      </button>
    </div>
  )
}

/* ===== QUICK STATS ROW ===== */
function QuickStats({ kpi }) {
  const stats = [
    { 
      icon: Activity, 
      iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
      label: 'Total Scans',
      value: kpi.total_reads.toLocaleString(),
      subtext: 'All time reads',
      starred: true
    },
    { 
      icon: CheckCircle2, 
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      label: 'Verified',
      value: kpi.verified.toLocaleString(),
      subtext: 'Confirmed plates',
      starred: false
    },
    { 
      icon: Clock, 
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
      label: 'Pending',
      value: kpi.pending.toLocaleString(),
      subtext: 'Awaiting review',
      starred: false
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>
        <button className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors flex items-center gap-1">
          View All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  )
}

/* ===== DATABASE SECTION ===== */
function DatabaseSection({ kpi }) {
  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? ((kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100).toFixed(1)
    : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Master Database Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Master Database</h3>
          <button className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors flex items-center gap-1">
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-6 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
            <Database className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{kpi.master_total.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Records</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                <Zap className="w-4 h-4 text-teal-600" />
              </div>
              <span className="text-sm text-gray-600">Auto-Master</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{kpi.auto_master.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Eye className="w-4 h-4 text-violet-600" />
              </div>
              <span className="text-sm text-gray-600">Manual Entry</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{(kpi.master_total - kpi.auto_master).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* AI Accuracy Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">AI Performance</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            accuracy >= 90 
              ? 'bg-emerald-100 text-emerald-700' 
              : accuracy >= 75 
                ? 'bg-amber-100 text-amber-700' 
                : 'bg-red-100 text-red-700'
          }`}>
            {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Review'}
          </span>
        </div>

        <div className="flex items-center gap-6 mb-6">
          <div className="relative">
            <svg className="w-20 h-20 -rotate-90">
              <circle
                className="text-gray-100"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
                r="32"
                cx="40"
                cy="40"
              />
              <circle
                className="text-violet-500"
                strokeWidth="8"
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="32"
                cx="40"
                cy="40"
                style={{
                  strokeDasharray: `${2 * Math.PI * 32}`,
                  strokeDashoffset: `${2 * Math.PI * 32 * (1 - accuracy / 100)}`,
                  transition: 'stroke-dashoffset 1s ease-out'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-900">{accuracy}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-2">Recognition Accuracy</p>
            <p className="text-xs text-gray-400">Based on {(kpi.alpr_total + kpi.mlpr_total).toLocaleString()} samples</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <p className="text-xs text-emerald-600 font-medium mb-1">ALPR Correct</p>
            <p className="text-lg font-bold text-gray-900">{kpi.alpr_total.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-xl">
            <p className="text-xs text-orange-600 font-medium mb-1">MLPR Corrected</p>
            <p className="text-lg font-bold text-gray-900">{kpi.mlpr_total.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== SYSTEM STATUS ===== */
function SystemStatus() {
  const metrics = [
    { icon: Cpu, label: 'CPU Usage', value: '45%', status: 'good' },
    { icon: Target, label: 'Throughput', value: '125/min', status: 'good' },
    { icon: Shield, label: 'Uptime', value: '99.8%', status: 'good' },
    { icon: Camera, label: 'Active Cams', value: '12/12', status: 'good' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
        <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          All Systems Operational
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="text-center p-4 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center mx-auto mb-3">
              <metric.icon className="w-5 h-5 text-violet-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{metric.value}</p>
            <p className="text-xs text-gray-500">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== LOADING STATE ===== */
function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
          <Camera className="w-6 h-6 text-white" />
        </div>
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    </div>
  )
}

/* ===== ERROR STATE ===== */
function ErrorState({ error }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-red-100 p-6 max-w-md shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Connection Error</h3>
            <p className="text-sm text-gray-500">{error}</p>
            <button className="mt-4 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
              Try Again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== MAIN DASHBOARD ===== */
export default function Dashboard() {
  const [kpi, setKpi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header />

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
          {/* Hero Banner */}
          <HeroBanner kpi={kpi} />

          {/* Quick Stats */}
          <QuickStats kpi={kpi} />

          {/* Database & AI Performance */}
          <DatabaseSection kpi={kpi} />

          {/* System Status */}
          <SystemStatus />
        </main>
      </div>
    </div>
  )
}
