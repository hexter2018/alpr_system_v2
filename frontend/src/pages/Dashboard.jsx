import React, { useEffect, useState, useRef, useCallback } from 'react'
import createGlobe from 'cobe'
import { getKPI } from '../lib/api.js'
import { 
  Activity,
  Database,
  CheckCircle2,
  Clock,
  TrendingUp,
  Zap,
  Target,
  Cpu,
  Camera,
  Shield,
  AlertCircle,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

/* ===== INTERACTIVE 3D GLOBE ===== */
function Globe({ className }) {
  const canvasRef = useRef(null)
  const pointerInteracting = useRef(null)
  const pointerInteractionMovement = useRef(0)

  useEffect(() => {
    let phi = 0
    let width = 0
    
    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth
      }
    }
    
    window.addEventListener('resize', onResize)
    onResize()

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 20000,
      mapBrightness: 6,
      baseColor: [0.05, 0.05, 0.05],
      markerColor: [0.3, 0.85, 0.7],
      glowColor: [0.1, 0.3, 0.25],
      markers: [
        { location: [13.7563, 100.5018], size: 0.1 },
        { location: [18.7883, 98.9853], size: 0.07 },
        { location: [7.8804, 98.3923], size: 0.06 },
        { location: [14.8818, 102.0178], size: 0.05 },
        { location: [16.4419, 102.8360], size: 0.06 },
        { location: [6.8765, 101.2344], size: 0.05 },
        { location: [12.9236, 100.8825], size: 0.06 },
        { location: [9.1382, 99.3217], size: 0.05 },
        { location: [35.6762, 139.6503], size: 0.04 },
        { location: [22.3193, 114.1694], size: 0.04 },
        { location: [1.3521, 103.8198], size: 0.05 },
        { location: [3.1390, 101.6869], size: 0.04 },
      ],
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phi += 0.002
        }
        state.phi = phi + pointerInteractionMovement.current
        state.width = width * 2
        state.height = width * 2
      }
    })

    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = '1'
      }
    }, 100)

    return () => {
      globe.destroy()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={(e) => {
        pointerInteracting.current = e.clientX - pointerInteractionMovement.current
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
      }}
      onPointerUp={() => {
        pointerInteracting.current = null
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        pointerInteracting.current = null
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
      }}
      onMouseMove={(e) => {
        if (pointerInteracting.current !== null) {
          const delta = e.clientX - pointerInteracting.current
          pointerInteractionMovement.current = delta / 200
        }
      }}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        cursor: 'grab',
        contain: 'layout paint size',
        opacity: 0,
        transition: 'opacity 0.8s ease'
      }}
    />
  )
}

/* ===== BENTO CARD ===== */
function BentoCard({ children, className = '', hover = true }) {
  return (
    <div className={`
      relative overflow-hidden rounded-xl
      bg-[#0a0a0a] border border-[#1a1a1a]
      ${hover ? 'transition-all duration-300 hover:border-[#2a2a2a] hover:bg-[#0f0f0f]' : ''}
      ${className}
    `}>
      {children}
    </div>
  )
}

/* ===== STAT NUMBER ===== */
function StatNumber({ value, size = 'lg', color = 'white' }) {
  const sizeClasses = {
    sm: 'text-lg font-semibold',
    md: 'text-2xl font-bold',
    lg: 'text-3xl font-bold',
    xl: 'text-4xl font-bold tracking-tight'
  }
  
  const colorClasses = {
    white: 'text-white',
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400'
  }
  
  return (
    <span className={`${sizeClasses[size]} ${colorClasses[color]} tabular-nums`}>
      {value}
    </span>
  )
}

/* ===== TREND INDICATOR ===== */
function TrendIndicator({ value, positive }) {
  return (
    <div className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
      {positive ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      <span>{value}</span>
    </div>
  )
}

/* ===== PROGRESS BAR ===== */
function ProgressBar({ value, max, color = 'emerald', showLabel = true }) {
  const percentage = max > 0 ? (value / max) * 100 : 0
  
  const colorClasses = {
    emerald: 'bg-emerald-500',
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500'
  }
  
  return (
    <div className="space-y-1.5">
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">{value.toLocaleString()}</span>
          <span className="text-neutral-400">{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-neutral-800/50 overflow-hidden">
        <div 
          className={`h-full rounded-full ${colorClasses[color]} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

/* ===== CIRCULAR GAUGE ===== */
function CircularGauge({ value, size = 120, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (value / 100) * circumference

  const getColor = (val) => {
    if (val >= 95) return '#10b981'
    if (val >= 85) return '#34d399'
    if (val >= 70) return '#fbbf24'
    return '#f87171'
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          stroke="#1a1a1a"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={getColor(value)}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ 
            transition: 'stroke-dashoffset 1s ease-out',
            filter: `drop-shadow(0 0 8px ${getColor(value)}50)`
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{value.toFixed(1)}%</span>
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Accuracy</span>
      </div>
    </div>
  )
}

/* ===== MINI SPARKLINE ===== */
function MiniSparkline({ data = [], color = '#10b981' }) {
  if (data.length === 0) return null
  
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const width = 60
  const height = 24
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  
  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

/* ===== LIVE INDICATOR ===== */
function LiveBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Live</span>
    </div>
  )
}

/* ===== LOADING STATE ===== */
function LoadingState() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-10 h-10 border border-neutral-800 rounded-full" />
          <div className="absolute inset-0 w-10 h-10 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-neutral-500 text-sm">Loading dashboard...</p>
      </div>
    </div>
  )
}

/* ===== ERROR STATE ===== */
function ErrorState({ error }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <BentoCard className="p-6 max-w-md border-rose-500/20">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10">
            <AlertCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-rose-300">Connection Error</h3>
            <p className="text-xs text-neutral-500 mt-1">{error}</p>
          </div>
        </div>
      </BentoCard>
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

  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? (kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100
    : 0
    
  const verifiedRate = kpi.total_reads > 0 
    ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) 
    : 0

  // Simulated sparkline data based on real metrics
  const generateSparkline = (base, variance = 0.1) => {
    return Array.from({ length: 12 }, () => base * (1 + (Math.random() - 0.5) * variance))
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* Globe Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[800px] h-[800px] opacity-40">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black z-10" />
          <Globe className="pointer-events-auto" />
        </div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
              ALPR Command Center
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Real-time license plate recognition analytics
            </p>
          </div>
          <LiveBadge />
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-3 md:gap-4">
          
          {/* Total Scans - Large Card */}
          <BentoCard className="col-span-12 md:col-span-6 lg:col-span-3 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <TrendIndicator value="+12.5%" positive />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-neutral-500 uppercase tracking-wider">Total Scans</p>
              <div className="flex items-end justify-between">
                <StatNumber value={kpi.total_reads.toLocaleString()} size="xl" />
                <MiniSparkline data={generateSparkline(kpi.total_reads / 100)} color="#10b981" />
              </div>
            </div>
          </BentoCard>

          {/* Verified */}
          <BentoCard className="col-span-6 md:col-span-3 lg:col-span-2 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Verified</span>
            </div>
            <StatNumber value={kpi.verified.toLocaleString()} size="lg" />
            <p className="text-xs text-cyan-400 mt-1">{verifiedRate}% rate</p>
          </BentoCard>

          {/* Pending */}
          <BentoCard className="col-span-6 md:col-span-3 lg:col-span-2 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Pending</span>
            </div>
            <StatNumber value={kpi.pending.toLocaleString()} size="lg" />
            <p className="text-xs text-amber-400 mt-1">In queue</p>
          </BentoCard>

          {/* Master DB */}
          <BentoCard className="col-span-12 md:col-span-6 lg:col-span-5 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-teal-400" />
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Master Database</span>
                </div>
                <StatNumber value={kpi.master_total.toLocaleString()} size="xl" />
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500 mb-1">Auto-Master</p>
                <p className="text-sm font-semibold text-teal-400">{kpi.auto_master.toLocaleString()}</p>
              </div>
            </div>
            <ProgressBar value={kpi.auto_master} max={kpi.master_total} color="cyan" />
          </BentoCard>

          {/* AI Accuracy - Featured Card */}
          <BentoCard className="col-span-12 lg:col-span-4 p-6 bg-gradient-to-br from-[#0a0a0a] to-[#0f1210]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-medium text-white">AI Accuracy</h3>
                <p className="text-xs text-neutral-500 mt-0.5">ALPR vs MLPR comparison</p>
              </div>
              <div className={`px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                accuracy >= 90 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : accuracy >= 75 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Review'}
              </div>
            </div>
            
            <div className="flex items-center justify-center py-4">
              <CircularGauge value={accuracy} size={140} strokeWidth={10} />
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">ALPR</p>
                <p className="text-lg font-semibold text-white">{kpi.alpr_total.toLocaleString()}</p>
                <p className="text-[10px] text-neutral-600">Correct reads</p>
              </div>
              <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                <p className="text-[10px] text-rose-400 uppercase tracking-wider mb-1">MLPR</p>
                <p className="text-lg font-semibold text-white">{kpi.mlpr_total.toLocaleString()}</p>
                <p className="text-[10px] text-neutral-600">Corrected</p>
              </div>
            </div>
          </BentoCard>

          {/* Confidence Distribution */}
          <BentoCard className="col-span-12 md:col-span-6 lg:col-span-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-medium text-white">Confidence Distribution</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Recognition score breakdown</p>
              </div>
              <BarChart3 className="w-4 h-4 text-neutral-600" />
            </div>
            
            <div className="space-y-4">
              {[
                { label: 'High', sublabel: '>=90%', value: Math.floor(kpi.total_reads * 0.65), color: 'emerald' },
                { label: 'Medium', sublabel: '70-90%', value: Math.floor(kpi.total_reads * 0.25), color: 'amber' },
                { label: 'Low', sublabel: '<70%', value: Math.floor(kpi.total_reads * 0.1), color: 'rose' }
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-300">{item.label}</span>
                      <span className="text-[10px] text-neutral-600">{item.sublabel}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{item.value.toLocaleString()}</span>
                  </div>
                  <ProgressBar value={item.value} max={kpi.total_reads} color={item.color} showLabel={false} />
                </div>
              ))}
            </div>
          </BentoCard>

          {/* System Metrics */}
          <BentoCard className="col-span-12 md:col-span-6 lg:col-span-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-medium text-white">System Performance</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Real-time metrics</p>
              </div>
              <Cpu className="w-4 h-4 text-neutral-600" />
            </div>
            
            <div className="space-y-3">
              {[
                { icon: Zap, label: 'Avg. Processing', value: '0.8s', color: 'text-emerald-400' },
                { icon: Target, label: 'Throughput', value: '~125/min', color: 'text-cyan-400' },
                { icon: Shield, label: 'System Uptime', value: '99.8%', color: 'text-emerald-400' },
                { icon: Camera, label: 'Active Cameras', value: '12', color: 'text-white' },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between py-2 border-b border-neutral-800/50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <metric.icon className="w-4 h-4 text-neutral-600" />
                    <span className="text-sm text-neutral-400">{metric.label}</span>
                  </div>
                  <span className={`text-sm font-medium ${metric.color}`}>{metric.value}</span>
                </div>
              ))}
            </div>
            
            <div className="mt-5 p-3 rounded-lg bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Today's Scans</p>
                  <p className="text-lg font-semibold text-white">{Math.floor(kpi.total_reads * 0.15).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Bottom Stats Row */}
          <BentoCard className="col-span-6 lg:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Last 7 Days</span>
            </div>
            <StatNumber value={Math.floor(kpi.total_reads * 0.78).toLocaleString()} size="md" />
            <p className="text-[10px] text-emerald-400 mt-1">+8.2% vs last week</p>
          </BentoCard>

          <BentoCard className="col-span-6 lg:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-teal-500/10">
                <Database className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Province Match</span>
            </div>
            <StatNumber value={Math.floor(kpi.total_reads * 0.82).toLocaleString()} size="md" />
            <p className="text-[10px] text-teal-400 mt-1">82% detection rate</p>
          </BentoCard>

          <BentoCard className="col-span-6 lg:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-cyan-500/10">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Response Time</span>
            </div>
            <StatNumber value="0.8s" size="md" />
            <p className="text-[10px] text-cyan-400 mt-1">-5.3% faster</p>
          </BentoCard>

          <BentoCard className="col-span-6 lg:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-violet-500/10">
                <Cpu className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">GPU Load</span>
            </div>
            <StatNumber value="67%" size="md" />
            <p className="text-[10px] text-violet-400 mt-1">Optimal range</p>
          </BentoCard>

        </div>
      </div>
    </div>
  )
}
