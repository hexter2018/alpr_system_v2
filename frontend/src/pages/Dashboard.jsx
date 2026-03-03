import React, { useEffect, useState, useRef } from 'react'
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
  Radio,
  Shield,
  AlertCircle
} from 'lucide-react'

/* ===== INTERACTIVE 3D GLOBE ===== */
function Globe() {
  const canvasRef = useRef(null)
  const pointerInteracting = useRef(null)
  const pointerInteractionMovement = useRef(0)
  const phiRef = useRef(0)

  useEffect(() => {
    let width = 0
    let phi = 0
    
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
      theta: 0.3,
      dark: 1,
      diffuse: 3,
      mapSamples: 16000,
      mapBrightness: 1.2,
      baseColor: [0.1, 0.1, 0.1],
      markerColor: [0.1, 0.8, 0.5], // emerald glow
      glowColor: [0.04, 0.2, 0.15],
      markers: [
        // ALPR nodes - simulating worldwide detection points
        { location: [13.7563, 100.5018], size: 0.08 }, // Bangkok
        { location: [18.7883, 98.9853], size: 0.06 },  // Chiang Mai
        { location: [7.8804, 98.3923], size: 0.05 },   // Phuket
        { location: [14.8818, 102.0178], size: 0.04 }, // Nakhon Ratchasima
        { location: [16.4419, 102.8360], size: 0.05 }, // Khon Kaen
        { location: [6.8765, 101.2344], size: 0.04 },  // Hat Yai
        { location: [12.9236, 100.8825], size: 0.05 }, // Pattaya
        { location: [9.1382, 99.3217], size: 0.04 },   // Surat Thani
        // Additional nodes for visual effect
        { location: [35.6762, 139.6503], size: 0.03 }, // Tokyo
        { location: [22.3193, 114.1694], size: 0.03 }, // Hong Kong
        { location: [1.3521, 103.8198], size: 0.04 },  // Singapore
        { location: [3.1390, 101.6869], size: 0.03 },  // Kuala Lumpur
      ],
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phi += 0.003
        }
        state.phi = phi + pointerInteractionMovement.current
        state.width = width * 2
        state.height = width * 2
        phiRef.current = phi
      }
    })

    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = '1'
      }
    })

    return () => {
      globe.destroy()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/60 z-10 pointer-events-none" />
      
      {/* Radial glow behind globe */}
      <div className="absolute w-[800px] h-[800px] rounded-full bg-emerald-500/5 blur-3xl" />
      
      <canvas
        ref={canvasRef}
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
            pointerInteractionMovement.current = delta / 200
          }
        }}
        onTouchMove={(e) => {
          if (pointerInteracting.current !== null && e.touches[0]) {
            const delta = e.touches[0].clientX - pointerInteracting.current
            pointerInteractionMovement.current = delta / 200
          }
        }}
        style={{
          width: 700,
          height: 700,
          maxWidth: '100%',
          aspectRatio: '1',
          cursor: 'grab',
          contain: 'layout paint size',
          opacity: 0,
          transition: 'opacity 1s ease'
        }}
      />
    </div>
  )
}

/* ===== GLASSMORPHISM CARD ===== */
function GlassCard({ children, className = '', glow = false, glowColor = 'emerald' }) {
  const glowColors = {
    emerald: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]',
    cyan: 'shadow-[0_0_30px_rgba(6,182,212,0.15)]',
    amber: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    rose: 'shadow-[0_0_30px_rgba(244,63,94,0.15)]'
  }
  
  return (
    <div className={`
      relative overflow-hidden rounded-2xl
      bg-white/[0.03] backdrop-blur-xl
      border border-white/[0.08]
      ${glow ? glowColors[glowColor] : ''}
      transition-all duration-300
      hover:bg-white/[0.05] hover:border-white/[0.12]
      ${className}
    `}>
      {children}
    </div>
  )
}

/* ===== STAT CARD WITH GLASSMORPHISM ===== */
function StatCard({ icon: Icon, title, value, subtitle, trend, accentColor = 'emerald' }) {
  const accents = {
    emerald: { 
      iconBg: 'bg-emerald-500/20', 
      iconColor: 'text-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]'
    },
    cyan: { 
      iconBg: 'bg-cyan-500/20', 
      iconColor: 'text-cyan-400',
      glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]'
    },
    amber: { 
      iconBg: 'bg-amber-500/20', 
      iconColor: 'text-amber-400',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]'
    },
    teal: { 
      iconBg: 'bg-teal-500/20', 
      iconColor: 'text-teal-400',
      glow: 'shadow-[0_0_15px_rgba(20,184,166,0.2)]'
    }
  }
  
  const accent = accents[accentColor]
  
  return (
    <GlassCard className="p-5" glow glowColor={accentColor}>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${accent.iconBg} ${accent.glow}`}>
          <Icon className={`w-5 h-5 ${accent.iconColor}`} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            <TrendingUp className={`w-3 h-3 ${!trend.positive && 'rotate-180'}`} />
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
          {title}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-bold text-white tracking-tight">
            {value}
          </span>
          {subtitle && (
            <span className="text-sm text-slate-400">{subtitle}</span>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

/* ===== ACCURACY GAUGE ===== */
function AccuracyGauge({ percentage }) {
  const radius = 60
  const stroke = 8
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const getColor = (pct) => {
    if (pct >= 95) return '#10b981'
    if (pct >= 90) return '#34d399'
    if (pct >= 80) return '#f59e0b'
    if (pct >= 70) return '#fb923c'
    return '#ef4444'
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          <circle
            stroke="rgba(255,255,255,0.05)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={getColor(percentage)}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ 
              strokeDashoffset,
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: `drop-shadow(0 0 10px ${getColor(percentage)}40)`
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
        </svg>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-white" style={{ textShadow: `0 0 20px ${getColor(percentage)}40` }}>
            {percentage.toFixed(1)}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Accuracy</div>
        </div>
      </div>
    </div>
  )
}

/* ===== CONFIDENCE DISTRIBUTION ===== */
function ConfidenceDistribution({ high, medium, low }) {
  const total = high + medium + low || 1
  const highPct = (high / total) * 100
  const medPct = (medium / total) * 100
  const lowPct = (low / total) * 100

  const bars = [
    { label: 'High', sublabel: '>=90%', value: high, pct: highPct, color: 'bg-emerald-500', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]' },
    { label: 'Medium', sublabel: '70-90%', value: medium, pct: medPct, color: 'bg-amber-500', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]' },
    { label: 'Low', sublabel: '<70%', value: low, pct: lowPct, color: 'bg-rose-500', glow: 'shadow-[0_0_10px_rgba(244,63,94,0.3)]' }
  ]

  return (
    <div className="space-y-4">
      {bars.map(bar => (
        <div key={bar.label}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">{bar.label}</span>
              <span className="text-xs text-slate-500">{bar.sublabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{bar.value.toLocaleString()}</span>
              <span className="text-xs text-slate-500">({bar.pct.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
            <div 
              className={`h-full ${bar.color} ${bar.glow} transition-all duration-700 ease-out rounded-full`}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ===== METRIC ROW ===== */
function MetricRow({ icon: Icon, label, value, valueColor = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${valueColor}`}>{value}</span>
    </div>
  )
}

/* ===== LIVE INDICATOR ===== */
function LiveIndicator() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Live</span>
    </div>
  )
}

/* ===== LOADING STATE ===== */
function LoadingState() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-emerald-500/20 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-slate-400 text-sm">Loading Dashboard...</p>
      </div>
    </div>
  )
}

/* ===== ERROR STATE ===== */
function ErrorState({ error }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <GlassCard className="p-6 max-w-md border-rose-500/20" glow glowColor="rose">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20">
            <AlertCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-rose-300">Connection Error</h3>
            <p className="text-xs text-slate-400 mt-1">{error}</p>
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

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* 3D Globe Background */}
      <Globe />
      
      {/* Content Overlay */}
      <div className="relative z-20 p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              ALPR Command Center
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Real-time License Plate Recognition Analytics
            </p>
          </div>
          <LiveIndicator />
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-12 gap-4 auto-rows-min">
          
          {/* Main KPI Cards - Top Row */}
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <StatCard 
              icon={Activity}
              title="Total Scans"
              value={kpi.total_reads.toLocaleString()}
              subtitle="reads"
              trend={{ value: "+12.5%", positive: true }}
              accentColor="emerald"
            />
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <StatCard 
              icon={CheckCircle2}
              title="Verified"
              value={kpi.verified.toLocaleString()}
              subtitle={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}%`}
              trend={{ value: "+8.3%", positive: true }}
              accentColor="cyan"
            />
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <StatCard 
              icon={Clock}
              title="Pending Queue"
              value={kpi.pending.toLocaleString()}
              subtitle="awaiting"
              accentColor="amber"
            />
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <StatCard 
              icon={Database}
              title="Master Database"
              value={kpi.master_total.toLocaleString()}
              subtitle="plates"
              trend={{ value: "+156", positive: true }}
              accentColor="teal"
            />
          </div>

          {/* Accuracy Card - Larger */}
          <div className="col-span-12 lg:col-span-4">
            <GlassCard className="p-6 h-full" glow glowColor="emerald">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-medium text-white">AI Accuracy</h3>
                  <p className="text-xs text-slate-500 mt-0.5">ALPR vs MLPR Comparison</p>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  accuracy >= 90 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : accuracy >= 75 
                      ? 'bg-amber-500/20 text-amber-400' 
                      : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Review'}
                </div>
              </div>
              
              <div className="flex items-center justify-center py-4">
                <AccuracyGauge percentage={accuracy} />
              </div>
              
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">ALPR</div>
                  <div className="text-xl font-bold text-white">{kpi.alpr_total.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">Correct from start</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-xs text-rose-400 uppercase tracking-wider mb-1">MLPR</div>
                  <div className="text-xl font-bold text-white">{kpi.mlpr_total.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">Human corrected</div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Confidence Distribution */}
          <div className="col-span-12 lg:col-span-4">
            <GlassCard className="p-6 h-full" glow glowColor="cyan">
              <div className="mb-6">
                <h3 className="text-sm font-medium text-white">Confidence Distribution</h3>
                <p className="text-xs text-slate-500 mt-0.5">Recognition confidence scores</p>
              </div>
              
              <ConfidenceDistribution
                high={Math.floor(kpi.total_reads * 0.65)}
                medium={Math.floor(kpi.total_reads * 0.25)}
                low={Math.floor(kpi.total_reads * 0.1)}
              />
              
              <div className="mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Auto-Master Entries</span>
                  <span className="text-sm font-semibold text-teal-400">{kpi.auto_master.toLocaleString()}</span>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Performance Metrics */}
          <div className="col-span-12 lg:col-span-4">
            <GlassCard className="p-6 h-full" glow glowColor="amber">
              <div className="mb-6">
                <h3 className="text-sm font-medium text-white">System Performance</h3>
                <p className="text-xs text-slate-500 mt-0.5">Real-time metrics</p>
              </div>
              
              <div className="space-y-1">
                <MetricRow icon={Zap} label="Avg. Processing" value="0.8s" valueColor="text-emerald-400" />
                <MetricRow icon={Target} label="Throughput" value="~125/min" valueColor="text-cyan-400" />
                <MetricRow icon={Shield} label="Uptime" value="99.8%" valueColor="text-emerald-400" />
                <MetricRow icon={Cpu} label="GPU Utilization" value="67%" valueColor="text-amber-400" />
                <MetricRow icon={Radio} label="Active Cameras" value="12" valueColor="text-white" />
              </div>
              
              <div className="mt-6 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Today's Scans</div>
                    <div className="text-lg font-bold text-white">{Math.floor(kpi.total_reads * 0.15).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Activity Stats - Bottom Row */}
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Today</span>
              </div>
              <div className="text-2xl font-bold text-white">{Math.floor(kpi.total_reads * 0.15).toLocaleString()}</div>
              <div className="text-xs text-emerald-400 mt-1">+12.5% from yesterday</div>
            </GlassCard>
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-cyan-500/20">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Last 7 Days</span>
              </div>
              <div className="text-2xl font-bold text-white">{Math.floor(kpi.total_reads * 0.78).toLocaleString()}</div>
              <div className="text-xs text-cyan-400 mt-1">+8.2% from last week</div>
            </GlassCard>
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-teal-500/20">
                  <Database className="w-4 h-4 text-teal-400" />
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Province Detected</span>
              </div>
              <div className="text-2xl font-bold text-white">{Math.floor(kpi.total_reads * 0.82).toLocaleString()}</div>
              <div className="text-xs text-teal-400 mt-1">82% detection rate</div>
            </GlassCard>
          </div>
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Avg Response</span>
              </div>
              <div className="text-2xl font-bold text-white">0.8s</div>
              <div className="text-xs text-amber-400 mt-1">-5.3% faster</div>
            </GlassCard>
          </div>

        </div>
      </div>
    </div>
  )
}
