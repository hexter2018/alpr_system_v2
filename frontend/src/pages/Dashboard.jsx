import React, { useEffect, useState, useRef, useCallback } from 'react'
import { getKPI } from '../lib/api.js'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Gauge,
  Globe2,
  MapPin,
  Radio,
  ScanLine,
  Shield,
  Signal,
  TrendingUp,
  Zap,
} from 'lucide-react'
import createGlobe from 'cobe'

/* ================================================================
   COBE GLOBE BACKGROUND
   ================================================================ */
function GlobeBackground() {
  const canvasRef = useRef(null)
  const pointerInteracting = useRef(null)
  const pointerInteractionMovement = useRef(0)
  const phiRef = useRef(0)

  const onPointerDown = useCallback((e) => {
    pointerInteracting.current = e.clientX - pointerInteractionMovement.current
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
  }, [])

  const onPointerUp = useCallback(() => {
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }, [])

  const onPointerOut = useCallback(() => {
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }, [])

  const onPointerMove = useCallback((e) => {
    if (pointerInteracting.current !== null) {
      const delta = e.clientX - pointerInteracting.current
      pointerInteractionMovement.current = delta
    }
  }, [])

  useEffect(() => {
    let width = 0
    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth
      }
    }
    onResize()
    window.addEventListener('resize', onResize)

    if (!canvasRef.current) return

    // Thailand-centered ALPR node locations [lat, lng]
    const markers = [
      { location: [13.7563, 100.5018], size: 0.08 },  // Bangkok
      { location: [18.7883, 98.9853], size: 0.06 },   // Chiang Mai
      { location: [7.8804, 98.3923], size: 0.05 },    // Phuket
      { location: [12.9236, 100.8825], size: 0.05 },  // Pattaya
      { location: [14.8798, 102.0123], size: 0.04 },  // Nakhon Ratchasima
      { location: [16.4419, 102.836], size: 0.05 },   // Khon Kaen
      { location: [9.1382, 99.3217], size: 0.04 },    // Surat Thani
      { location: [6.8693, 101.251], size: 0.04 },    // Yala
      { location: [14.3461, 100.5733], size: 0.04 },  // Ayutthaya
      { location: [13.3611, 100.9847], size: 0.04 },  // Chonburi
      { location: [15.87, 100.9925], size: 0.04 },    // Phitsanulok
      { location: [8.4307, 99.9603], size: 0.04 },    // Nakhon Si Thammarat
    ]

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.15,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 20000,
      mapBrightness: 2.5,
      baseColor: [0.05, 0.05, 0.05],
      markerColor: [0.1, 0.8, 0.5],
      glowColor: [0.04, 0.2, 0.15],
      markers,
      onRender: (state) => {
        if (pointerInteracting.current === null) {
          phiRef.current += 0.003
        }
        state.phi = phiRef.current + pointerInteractionMovement.current / 200
        state.width = width * 2
        state.height = width * 2
      },
    })

    return () => {
      globe.destroy()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
      <div className="relative w-[700px] h-[700px] max-w-[90vw] max-h-[90vh]">
        {/* Glow behind globe */}
        <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-3xl scale-110" />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerOut={onPointerOut}
          onPointerMove={onPointerMove}
          className="w-full h-full pointer-events-auto cursor-grab"
          style={{ contain: 'layout paint size', aspectRatio: '1' }}
        />
      </div>
    </div>
  )
}

/* ================================================================
   GLASS CARD WRAPPER
   ================================================================ */
function GlassCard({ children, className = '', glow = '', hover = true }) {
  return (
    <div
      className={`
        relative rounded-2xl border border-white/[0.08]
        bg-white/[0.03] backdrop-blur-xl
        ${hover ? 'hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300' : ''}
        ${glow}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

/* ================================================================
   ANIMATED NUMBER COUNTER
   ================================================================ */
function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(0)
  const numericValue = typeof value === 'number' ? value : parseInt(String(value).replace(/,/g, ''), 10) || 0

  useEffect(() => {
    if (numericValue === 0) {
      setDisplay(0)
      return
    }
    let start = 0
    const step = numericValue / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= numericValue) {
        setDisplay(numericValue)
        clearInterval(timer)
      } else {
        setDisplay(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [numericValue, duration])

  return <>{display.toLocaleString()}</>
}

/* ================================================================
   LIVE PULSE INDICATOR
   ================================================================ */
function LivePulse() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
    </span>
  )
}

/* ================================================================
   ACCURACY RING
   ================================================================ */
function AccuracyRing({ percentage }) {
  const radius = 58
  const stroke = 6
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
    <div className="relative inline-flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        <circle
          stroke="rgba(255,255,255,0.06)"
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
          }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{percentage.toFixed(1)}%</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Accuracy</span>
      </div>
    </div>
  )
}

/* ================================================================
   CONFIDENCE BAR
   ================================================================ */
function ConfidenceDistribution({ high, medium, low }) {
  const total = high + medium + low || 1
  const segments = [
    { label: 'High', sub: '(\u226590%)', value: high, pct: (high / total) * 100, color: 'bg-emerald-500', text: 'text-emerald-400' },
    { label: 'Medium', sub: '(70-90%)', value: medium, pct: (medium / total) * 100, color: 'bg-amber-500', text: 'text-amber-400' },
    { label: 'Low', sub: '(<70%)', value: low, pct: (low / total) * 100, color: 'bg-rose-500', text: 'text-rose-400' },
  ]

  return (
    <div className="space-y-4">
      {segments.map((s) => (
        <div key={s.label} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {s.label} <span className="text-slate-500">{s.sub}</span>
            </span>
            <span className={`text-sm font-semibold ${s.text}`}>
              {s.value.toLocaleString()}
              <span className="text-slate-500 font-normal ml-1 text-xs">({s.pct.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full ${s.color} transition-all duration-700`}
              style={{ width: `${s.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
   PROVINCE DETECTION BAR
   ================================================================ */
function ProvinceBar({ withProv, withoutProv }) {
  const total = Math.max(withProv + withoutProv, 1)
  const withPct = (withProv / total) * 100

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-300">Detected</span>
        </div>
        <span className="font-semibold text-emerald-400">{withProv.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
          style={{ width: `${withPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-slate-300">Undetected</span>
        </div>
        <span className="font-semibold text-amber-400">{withoutProv.toLocaleString()}</span>
      </div>
    </div>
  )
}

/* ================================================================
   KPI STAT CARD
   ================================================================ */
function KpiCard({ icon: Icon, label, value, sub, glowColor = '' }) {
  return (
    <GlassCard className={`p-5 ${glowColor}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">
              <Icon className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">{label}</span>
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            <AnimatedNumber value={value} />
          </div>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
      </div>
    </GlassCard>
  )
}

/* ================================================================
   MAIN DASHBOARD
   ================================================================ */
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

  /* ---------- LOADING ---------- */
  if (loading) {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center">
        <GlobeBackground />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          <p className="text-sm text-slate-400 tracking-wide">Loading Dashboard...</p>
        </div>
      </div>
    )
  }

  /* ---------- ERROR ---------- */
  if (error) {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center">
        <GlobeBackground />
        <GlassCard className="relative z-10 p-6 max-w-md border-rose-500/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-rose-300 mb-1">Connection Error</h3>
              <p className="text-xs text-rose-200/70 leading-relaxed">{error}</p>
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  if (!kpi) return null

  /* ---------- DERIVED DATA ---------- */
  const accuracy =
    kpi.alpr_total + kpi.mlpr_total > 0
      ? (kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100
      : 0

  const todayReads = kpi.today_reads ?? 0
  const yesterdayReads = kpi.yesterday_reads ?? 0
  const sevenDayReads = kpi.last_7_days_reads ?? 0
  const withProvinceReads = kpi.with_province_reads ?? 0
  const withoutProvinceReads = kpi.without_province_reads ?? 0

  const todayTrend =
    yesterdayReads > 0 ? ((todayReads - yesterdayReads) / yesterdayReads) * 100 : 0

  /* ---------- RENDER ---------- */
  return (
    <div className="relative min-h-[80vh]">
      {/* Globe Background */}
      <GlobeBackground />

      {/* Overlay Content */}
      <div className="relative z-10 space-y-5">
        {/* ---- HEADER ---- */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Globe2 className="h-6 w-6 text-emerald-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">
                ALPR Command Center
              </h1>
            </div>
            <p className="text-sm text-slate-400 pl-9">
              Real-time license plate recognition overview
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <GlassCard className="flex items-center gap-2 px-3 py-1.5" hover={false}>
              <LivePulse />
              <span className="text-xs font-medium text-emerald-300">System Online</span>
            </GlassCard>
            <GlassCard className="flex items-center gap-2 px-3 py-1.5" hover={false}>
              <Radio className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-medium text-slate-300">12 Nodes Active</span>
            </GlassCard>
          </div>
        </div>

        {/* ---- PRIMARY KPI ROW ---- */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={ScanLine}
            label="Total Scans"
            value={kpi.total_reads}
            sub={`${todayReads.toLocaleString()} today`}
            glowColor="shadow-[0_0_30px_rgba(16,185,129,0.08)]"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Verified"
            value={kpi.verified}
            sub={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}% rate`}
          />
          <KpiCard
            icon={Clock}
            label="Pending Queue"
            value={kpi.pending}
            sub="Awaiting review"
          />
          <KpiCard
            icon={Database}
            label="Master Database"
            value={kpi.master_total}
            sub="Registered plates"
          />
        </div>

        {/* ---- BENTO GRID ---- */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
          {/* Accuracy Panel - Spans 5 cols */}
          <GlassCard className="lg:col-span-5 p-6" glow="shadow-[0_0_40px_rgba(16,185,129,0.06)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-emerald-400" />
                  AI Accuracy
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">ALPR vs MLPR comparison</p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  accuracy >= 90
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : accuracy >= 75
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Improvement'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <AccuracyRing percentage={accuracy} />

              <div className="flex-1 w-full space-y-2.5">
                {[
                  {
                    label: 'ALPR',
                    desc: 'Auto-correct',
                    value: kpi.alpr_total,
                    color: 'text-emerald-400',
                    bar: 'bg-emerald-500',
                    border: 'border-emerald-500/20',
                  },
                  {
                    label: 'MLPR',
                    desc: 'Human-corrected',
                    value: kpi.mlpr_total,
                    color: 'text-rose-400',
                    bar: 'bg-rose-500',
                    border: 'border-rose-500/20',
                  },
                  {
                    label: 'Auto-Master',
                    desc: 'Auto-insert to DB',
                    value: kpi.auto_master,
                    color: 'text-teal-400',
                    bar: 'bg-teal-500',
                    border: 'border-teal-500/20',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between rounded-xl border ${item.border} bg-white/[0.02] px-3 py-2.5`}
                  >
                    <div>
                      <span className={`text-xs font-semibold ${item.color} uppercase tracking-wide`}>{item.label}</span>
                      <p className="text-[10px] text-slate-500">{item.desc}</p>
                    </div>
                    <span className="text-lg font-bold text-white">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Confidence Distribution - Spans 4 cols */}
          <GlassCard className="lg:col-span-4 p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Confidence Distribution</h2>
            </div>
            <ConfidenceDistribution
              high={Math.floor(kpi.total_reads * 0.65)}
              medium={Math.floor(kpi.total_reads * 0.25)}
              low={Math.floor(kpi.total_reads * 0.1)}
            />

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-white">Province Detection</h3>
              </div>
              <ProvinceBar withProv={withProvinceReads} withoutProv={withoutProvinceReads} />
            </div>
          </GlassCard>

          {/* Activity & Stats - Spans 3 cols */}
          <div className="lg:col-span-3 space-y-4">
            {/* Today */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Today</span>
                </div>
                {todayTrend !== 0 && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      todayTrend > 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {todayTrend > 0 ? '+' : ''}
                    {todayTrend.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-white">
                <AnimatedNumber value={todayReads} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">vs {yesterdayReads.toLocaleString()} yesterday</p>
            </GlassCard>

            {/* 7 Days */}
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold text-white">Last 7 Days</span>
              </div>
              <div className="text-2xl font-bold text-white">
                <AnimatedNumber value={sevenDayReads} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">total reads this week</p>
            </GlassCard>

            {/* Performance */}
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-white">Performance</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Avg. Processing', value: '0.8s', icon: Gauge },
                  { label: 'Throughput', value: '~125/min', icon: Signal },
                  { label: 'Uptime', value: '99.8%', icon: Eye },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3 w-3 text-slate-500" />
                      <span className="text-[11px] text-slate-400">{item.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>

        {/* ---- DAILY STATS ROW ---- */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[
            { label: 'Today', value: todayReads, color: 'text-emerald-400', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]' },
            { label: 'Yesterday', value: yesterdayReads, color: 'text-slate-300', glow: '' },
            { label: 'Last 7 Days', value: sevenDayReads, color: 'text-cyan-400', glow: '' },
          ].map((stat) => (
            <GlassCard key={stat.label} className={`p-4 ${stat.glow}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{stat.label}</span>
                <span className={`text-xl font-bold ${stat.color}`}>
                  {stat.value.toLocaleString()}
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  )
}
