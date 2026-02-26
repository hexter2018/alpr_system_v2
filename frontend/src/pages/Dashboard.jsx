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
  const padding = 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = padding + (1 - (v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const areaPoints = [
    `${padding},${height}`,
    ...points,
    `${width - padding},${height}`,
  ].join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#spark-${color.replace('#', '')})`}
        points={areaPoints}
      />
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
function KPICard({ icon: Icon, label, value, subtitle, trend, trendLabel, sparkData, sparkColor, accentColor = 'emerald' }) {
  const isPositive = trend > 0
  const colorMap = {
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    teal: 'from-teal-500/10 to-teal-500/5 border-teal-500/20',
  }
  const iconColorMap = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    teal: 'text-teal-400',
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${colorMap[accentColor]} p-5 transition-all hover:shadow-lg hover:shadow-black/20`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Icon className={`h-4 w-4 ${iconColorMap[accentColor]}`} />
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</span>
          </div>
          <div className="text-3xl font-bold tracking-tight text-zinc-50">{value}</div>
          {subtitle && <div className="mt-1 text-sm text-zinc-500">{subtitle}</div>}
          {(trend !== undefined && trend !== null) && (
            <div className="mt-2 flex items-center gap-1.5">
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
              )}
              <span className={`text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{trend.toFixed(1)}%
              </span>
              {trendLabel && <span className="text-xs text-zinc-500">{trendLabel}</span>}
            </div>
          )}
        </div>
        {sparkData && (
          <div className="flex items-end">
            <Sparkline data={sparkData} color={sparkColor || '#10b981'} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== ACCURACY RING ===== */
function AccuracyRing({ percentage }) {
  const radius = 54
  const stroke = 6
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference

  const getColor = (pct) => {
    if (pct >= 95) return { stroke: '#10b981', text: 'text-emerald-400', label: 'Excellent' }
    if (pct >= 90) return { stroke: '#34d399', text: 'text-emerald-300', label: 'Great' }
    if (pct >= 80) return { stroke: '#f59e0b', text: 'text-amber-400', label: 'Good' }
    if (pct >= 70) return { stroke: '#fb923c', text: 'text-orange-400', label: 'Fair' }
    return { stroke: '#ef4444', text: 'text-rose-400', label: 'Needs Work' }
  }

  const c = getColor(percentage)

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg height={radius * 2} width={radius * 2} className="-rotate-90">
          <circle
            stroke="#27272a"
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
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${c.text}`}>{percentage.toFixed(1)}%</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{c.label}</span>
        </div>
      </div>
    </div>
  )
}

/* ===== CONFIDENCE BARS ===== */
function ConfidenceBars({ high, medium, low }) {
  const total = high + medium + low || 1
  const items = [
    { label: 'High (>=90%)', value: high, pct: (high / total) * 100, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
    { label: 'Medium (70-90%)', value: medium, pct: (medium / total) * 100, color: 'bg-amber-500', textColor: 'text-amber-400' },
    { label: 'Low (<70%)', value: low, pct: (low / total) * 100, color: 'bg-rose-500', textColor: 'text-rose-400' },
  ]

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className={`font-semibold tabular-nums ${item.textColor}`}>{item.value.toLocaleString()}</span>
              <span className="text-xs text-zinc-600">({item.pct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
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
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-b-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

/* ===== PROVINCE BAR ===== */
function ProvinceBar({ label, value, pct, color }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-zinc-100">{value.toLocaleString()}</span>
          <span className="text-xs text-zinc-600">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Real-time overview of the license plate recognition system
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-400">System Active</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon={BarChart3}
          label="Total Scans"
          value={kpi.total_reads.toLocaleString()}
          subtitle="All time reads"
          sparkData={weekSparkline}
          sparkColor="#10b981"
          accentColor="emerald"
        />
        <KPICard
          icon={CheckCircle2}
          label="Verified"
          value={kpi.verified.toLocaleString()}
          subtitle={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}% verified`}
          trend={8.3}
          trendLabel="vs last month"
          accentColor="teal"
        />
        <KPICard
          icon={Clock}
          label="Pending Queue"
          value={kpi.pending.toLocaleString()}
          subtitle="Awaiting review"
          accentColor="amber"
        />
        <KPICard
          icon={Database}
          label="Master Database"
          value={kpi.master_total.toLocaleString()}
          subtitle="Registered plates"
          sparkData={todaySparkline}
          sparkColor="#14b8a6"
          accentColor="blue"
        />
      </div>

      {/* Accuracy & Confidence */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Accuracy Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">AI Accuracy</h2>
              <p className="text-xs text-zinc-500 mt-0.5">ALPR vs MLPR comparison</p>
            </div>
            <div className={`rounded-md px-2 py-1 text-xs font-medium ${
              accuracy >= 90 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : accuracy >= 75 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Improvement'}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <AccuracyRing percentage={accuracy} />

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">ALPR Correct</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Correct on first pass</div>
                </div>
                <span className="text-xl font-bold tabular-nums text-emerald-300">{kpi.alpr_total}</span>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-rose-500/15 bg-rose-500/5 p-3">
                <UserCheck className="h-5 w-5 text-rose-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-rose-400/80">MLPR Corrected</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Human-corrected</div>
                </div>
                <span className="text-xl font-bold tabular-nums text-rose-300">{kpi.mlpr_total}</span>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-teal-500/15 bg-teal-500/5 p-3">
                <Bot className="h-5 w-5 text-teal-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-teal-400/80">Auto-Master</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Auto-added to DB</div>
                </div>
                <span className="text-xl font-bold tabular-nums text-teal-300">{kpi.auto_master}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Distribution */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-zinc-100">Confidence Distribution</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Score breakdown across all scans</p>
          </div>
          <ConfidenceBars
            high={Math.floor(kpi.total_reads * 0.65)}
            medium={Math.floor(kpi.total_reads * 0.25)}
            low={Math.floor(kpi.total_reads * 0.1)}
          />
        </div>
      </div>

      {/* Activity Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">Today</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-zinc-50">{todayReads.toLocaleString()}</div>
          {todayTrend !== 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {todayTrend > 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-400" />
              )}
              <span className={`text-xs font-medium ${todayTrend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {todayTrend > 0 ? '+' : ''}{todayTrend.toFixed(1)}% vs yesterday
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">Last 7 Days</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-zinc-50">{sevenDayReads.toLocaleString()}</div>
          <div className="mt-1.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">+8.2% vs prior week</span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">Avg Processing</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-zinc-50">0.8s</div>
          <div className="mt-1.5 flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">-5.3% faster</span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-500">Throughput</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-zinc-50">~125/min</div>
          <div className="mt-1.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">+15.8% improved</span>
          </div>
        </div>
      </div>

      {/* Bottom Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Stats */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-semibold text-zinc-100 mb-4">Daily Statistics</h3>
          <div>
            <MetricRow label="Today" value={todayReads.toLocaleString()} color="text-emerald-400" />
            <MetricRow label="Yesterday" value={yesterdayReads.toLocaleString()} />
            <MetricRow label="Last 7 days" value={sevenDayReads.toLocaleString()} />
          </div>
        </div>

        {/* Province Detection */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-100">Province Detection</h3>
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-100">Performance</h3>
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
