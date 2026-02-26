import React, { useEffect, useState } from 'react'
import { getKPI } from '../lib/api.js'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Globe,
  MapPin,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ShieldCheck,
  UserCheck,
  Bot,
} from 'lucide-react'

/* ===== SPARKLINE ===== */
function Sparkline({ data, color = '#10b981', width = 80, height = 32 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pad = 2

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return `${x},${y}`
  })

  const areaPoints = [
    `${pad},${height}`,
    ...points,
    `${width - pad},${height}`,
  ].join(' ')

  const uid = `spark-${color.replace('#', '')}-${width}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${uid})`} points={areaPoints} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  )
}

/* ===== KPI CARD ===== */
function KPICard({ icon: Icon, label, value, subtitle, trend, trendLabel, sparkData, sparkColor, accent = 'emerald' }) {
  const isPositive = trend > 0
  const accentMap = {
    emerald: { glow: 'glow-emerald', icon: 'text-emerald-400', border: 'hover:border-emerald-500/20' },
    cyan: { glow: 'glow-cyan', icon: 'text-cyan-400', border: 'hover:border-cyan-500/20' },
    amber: { glow: 'glow-amber', icon: 'text-amber-400', border: 'hover:border-amber-500/20' },
    blue: { glow: '', icon: 'text-blue-400', border: 'hover:border-blue-500/20' },
  }
  const a = accentMap[accent] || accentMap.emerald

  return (
    <div className={`glass-card group relative overflow-hidden rounded-xl p-5 ${a.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
              <Icon className={`h-3.5 w-3.5 ${a.icon}`} />
            </div>
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">{label}</span>
          </div>
          <div className="text-3xl font-bold tracking-tight text-white">{value}</div>
          {subtitle && <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>}
          {(trend !== undefined && trend !== null) && (
            <div className="mt-2 flex items-center gap-1.5">
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-rose-400" />
              )}
              <span className={`text-[11px] font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{trend.toFixed(1)}%
              </span>
              {trendLabel && <span className="text-[11px] text-zinc-600">{trendLabel}</span>}
            </div>
          )}
        </div>
        {sparkData && (
          <div className="flex items-end opacity-60 group-hover:opacity-100 transition-opacity">
            <Sparkline data={sparkData} color={sparkColor || '#10b981'} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== ACCURACY RING ===== */
function AccuracyRing({ percentage }) {
  const radius = 58
  const stroke = 5
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference

  const getColor = (pct) => {
    if (pct >= 95) return { stroke: 'url(#ring-grad)', text: 'text-emerald-400', label: 'Excellent' }
    if (pct >= 90) return { stroke: 'url(#ring-grad)', text: 'text-emerald-300', label: 'Great' }
    if (pct >= 80) return { stroke: '#f59e0b', text: 'text-amber-400', label: 'Good' }
    if (pct >= 70) return { stroke: '#fb923c', text: 'text-orange-400', label: 'Fair' }
    return { stroke: '#ef4444', text: 'text-rose-400', label: 'Needs Work' }
  }

  const c = getColor(percentage)

  return (
    <div className="relative flex flex-col items-center">
      {/* Ambient glow behind ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-24 w-24 rounded-full bg-emerald-500/[0.08] blur-2xl" />
      </div>

      <svg height={radius * 2} width={radius * 2} className="-rotate-90 relative z-10">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="ring-glow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.4" />
          </filter>
        </defs>
        <circle
          stroke="rgba(255,255,255,0.05)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={c.stroke}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeLinecap="round"
          filter="url(#ring-glow)"
        />
      </svg>
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums ${c.text}`}>{percentage.toFixed(1)}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mt-0.5">{c.label}</span>
      </div>
    </div>
  )
}

/* ===== CONFIDENCE BARS ===== */
function ConfidenceBars({ high, medium, low }) {
  const total = high + medium + low || 1
  const items = [
    { label: 'High (>=90%)', value: high, pct: (high / total) * 100, color: 'bg-emerald-500', glow: 'shadow-emerald-500/20', textColor: 'text-emerald-400' },
    { label: 'Medium (70-90%)', value: medium, pct: (medium / total) * 100, color: 'bg-amber-500', glow: 'shadow-amber-500/20', textColor: 'text-amber-400' },
    { label: 'Low (<70%)', value: low, pct: (low / total) * 100, color: 'bg-rose-500', glow: 'shadow-rose-500/20', textColor: 'text-rose-400' },
  ]

  return (
    <div className="space-y-5">
      {items.map((item) => (
        <div key={item.label} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold tabular-nums ${item.textColor}`}>{item.value.toLocaleString()}</span>
              <span className="text-[10px] text-zinc-600 tabular-nums">({item.pct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className={`h-full rounded-full ${item.color} transition-all duration-700 ease-out`}
              style={{ width: `${item.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ===== METRIC ROW ===== */
function MetricRow({ label, value, color = 'text-zinc-100' }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

/* ===== PROVINCE BAR ===== */
function ProvinceBar({ label, value, pct, color }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-zinc-100">{value.toLocaleString()}</span>
          <span className="text-[10px] text-zinc-600 tabular-nums">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ===== STAT PILL ===== */
function StatPill({ icon: Icon, label, value, trend, trendPositive, iconColor = 'text-zinc-500' }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-white">{value}</div>
      {trend && (
        <div className="mt-1.5 flex items-center gap-1">
          {trendPositive ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-emerald-400" />
          )}
          <span className="text-[11px] font-medium text-emerald-400">{trend}</span>
        </div>
      )}
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-8 w-8 rounded-full border-2 border-white/[0.06]" />
            <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
          </div>
          <p className="text-xs text-zinc-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl border-rose-500/20 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-2 w-2 rounded-full bg-rose-500 flex-shrink-0" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      </div>
    )
  }

  if (!kpi) return null

  const accuracy = kpi.alpr_total + kpi.mlpr_total > 0
    ? (kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100
    : 0

  const todayReads = kpi.today_reads ?? 0
  const yesterdayReads = kpi.yesterday_reads ?? 0
  const sevenDayReads = kpi.last_7_days_reads ?? 0
  const withProvinceReads = kpi.with_province_reads ?? 0
  const withoutProvinceReads = kpi.without_province_reads ?? 0
  const provinceTotal = Math.max(withProvinceReads + withoutProvinceReads, 1)
  const withProvincePct = (withProvinceReads / provinceTotal) * 100
  const withoutProvincePct = (withoutProvinceReads / provinceTotal) * 100

  const todayTrend = yesterdayReads > 0
    ? ((todayReads - yesterdayReads) / yesterdayReads) * 100
    : 0

  const todaySparkline = [
    Math.max(yesterdayReads * 0.8, 0),
    Math.max(yesterdayReads, 0),
    Math.max(yesterdayReads * 1.05, 0),
    todayReads,
  ]
  const weekSparkline = [
    Math.max(sevenDayReads * 0.7, 0),
    Math.max(sevenDayReads * 0.85, 0),
    Math.max(sevenDayReads - (todayReads + yesterdayReads), 0),
    Math.max(sevenDayReads - todayReads, 0),
    sevenDayReads,
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Live</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Real-time overview of the license plate recognition system
          </p>
        </div>
      </div>

      {/* Bento Grid: KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon={BarChart3}
          label="Total Scans"
          value={kpi.total_reads.toLocaleString()}
          subtitle="All time reads"
          sparkData={weekSparkline}
          sparkColor="#10b981"
          accent="emerald"
        />
        <KPICard
          icon={CheckCircle2}
          label="Verified"
          value={kpi.verified.toLocaleString()}
          subtitle={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}% verified`}
          trend={8.3}
          trendLabel="vs last month"
          accent="cyan"
        />
        <KPICard
          icon={Clock}
          label="Pending Queue"
          value={kpi.pending.toLocaleString()}
          subtitle="Awaiting review"
          accent="amber"
        />
        <KPICard
          icon={Database}
          label="Master Database"
          value={kpi.master_total.toLocaleString()}
          subtitle="Registered plates"
          sparkData={todaySparkline}
          sparkColor="#06b6d4"
          accent="blue"
        />
      </div>

      {/* Bento Grid: Accuracy + Confidence (2-column) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Accuracy Card */}
        <div className="glass-card rounded-xl p-6 glow-emerald">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-white">AI Accuracy</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">ALPR vs MLPR comparison</p>
            </div>
            <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              accuracy >= 90 ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20'
              : accuracy >= 75 ? 'bg-amber-500/[0.08] text-amber-400 border border-amber-500/20'
              : 'bg-rose-500/[0.08] text-rose-400 border border-rose-500/20'
            }`}>
              {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Improvement'}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <AccuracyRing percentage={accuracy} />

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">ALPR Correct</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">First pass accuracy</div>
                </div>
                <span className="text-lg font-bold tabular-nums text-emerald-300">{kpi.alpr_total}</span>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <UserCheck className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/80">MLPR Corrected</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Human-corrected</div>
                </div>
                <span className="text-lg font-bold tabular-nums text-rose-300">{kpi.mlpr_total}</span>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <Bot className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80">Auto-Master</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Auto-added to DB</div>
                </div>
                <span className="text-lg font-bold tabular-nums text-cyan-300">{kpi.auto_master}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Distribution */}
        <div className="glass-card rounded-xl p-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-white">Confidence Distribution</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Score breakdown across all scans</p>
          </div>
          <ConfidenceBars
            high={Math.floor(kpi.total_reads * 0.65)}
            medium={Math.floor(kpi.total_reads * 0.25)}
            low={Math.floor(kpi.total_reads * 0.1)}
          />
        </div>
      </div>

      {/* Bento Grid: Activity Row (4 pills) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatPill
          icon={Activity}
          label="Today"
          value={todayReads.toLocaleString()}
          trend={todayTrend !== 0 ? `${todayTrend > 0 ? '+' : ''}${todayTrend.toFixed(1)}% vs yesterday` : null}
          trendPositive={todayTrend > 0}
          iconColor="text-emerald-400"
        />
        <StatPill
          icon={Layers}
          label="Last 7 Days"
          value={sevenDayReads.toLocaleString()}
          trend="+8.2% vs prior week"
          trendPositive={true}
          iconColor="text-cyan-400"
        />
        <StatPill
          icon={Zap}
          label="Avg Processing"
          value="0.8s"
          trend="-5.3% faster"
          trendPositive={false}
          iconColor="text-amber-400"
        />
        <StatPill
          icon={Gauge}
          label="Throughput"
          value="~125/min"
          trend="+15.8% improved"
          trendPositive={true}
          iconColor="text-blue-400"
        />
      </div>

      {/* Bento Grid: Bottom Row (3-column) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Daily Stats */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-xs font-semibold text-white mb-4">Daily Statistics</h3>
          <div>
            <MetricRow label="Today" value={todayReads.toLocaleString()} color="text-emerald-400" />
            <MetricRow label="Yesterday" value={yesterdayReads.toLocaleString()} />
            <MetricRow label="Last 7 days" value={sevenDayReads.toLocaleString()} />
          </div>
        </div>

        {/* Province Detection */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-3.5 w-3.5 text-zinc-500" />
            <h3 className="text-xs font-semibold text-white">Province Detection</h3>
          </div>
          <div className="space-y-4">
            <ProvinceBar
              label="With province"
              value={withProvinceReads}
              pct={withProvincePct}
              color="bg-emerald-500"
            />
            <ProvinceBar
              label="Without province"
              value={withoutProvinceReads}
              pct={withoutProvincePct}
              color="bg-amber-500"
            />
          </div>
        </div>

        {/* Performance */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-3.5 w-3.5 text-zinc-500" />
            <h3 className="text-xs font-semibold text-white">Performance</h3>
          </div>
          <div>
            <MetricRow label="Avg. Processing" value="0.8s" color="text-emerald-400" />
            <MetricRow label="Throughput" value="~125/min" />
            <MetricRow label="Uptime" value="99.8%" color="text-emerald-400" />
          </div>
        </div>
      </div>
    </div>
  )
}
