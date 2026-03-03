import React, { useEffect, useState } from 'react'
import { getKPI } from '../lib/api.js'
import { useTheme } from '../lib/ThemeContext.jsx'
import {
  Card,
  CardBody,
  CardHeader,
  Badge,
  SkeletonCard,
} from '../components/UIComponents.jsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Cell,
} from 'recharts'
import {
  ScanLine,
  CheckCircle2,
  Clock4,
  Database,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react'

/* ── Enterprise KPI Card ── */
function KPICard({ title, value, subtitle, icon: Icon, accentColor, trend, sparkData }) {
  const { theme } = useTheme()
  const light = theme === 'light'

  const colorMap = {
    blue: {
      iconBg: light ? 'bg-blue-50' : 'bg-blue-500/10',
      iconText: 'text-blue-500',
      accent: '#3b82f6',
      border: light ? 'border-blue-100' : 'border-blue-500/20',
    },
    emerald: {
      iconBg: light ? 'bg-emerald-50' : 'bg-emerald-500/10',
      iconText: 'text-emerald-500',
      accent: '#10b981',
      border: light ? 'border-emerald-100' : 'border-emerald-500/20',
    },
    amber: {
      iconBg: light ? 'bg-amber-50' : 'bg-amber-500/10',
      iconText: 'text-amber-500',
      accent: '#f59e0b',
      border: light ? 'border-amber-100' : 'border-amber-500/20',
    },
    slate: {
      iconBg: light ? 'bg-slate-100' : 'bg-slate-500/10',
      iconText: light ? 'text-slate-600' : 'text-slate-400',
      accent: '#64748b',
      border: light ? 'border-slate-200' : 'border-slate-500/20',
    },
    red: {
      iconBg: light ? 'bg-red-50' : 'bg-red-500/10',
      iconText: 'text-red-500',
      accent: '#ef4444',
      border: light ? 'border-red-100' : 'border-red-500/20',
    },
  }

  const c = colorMap[accentColor] || colorMap.blue

  return (
    <div className={`group relative rounded-xl border overflow-hidden transition-all duration-300 ${
      light
        ? 'border-slate-200 bg-white hover:shadow-lg hover:shadow-slate-200/50 hover:border-slate-300'
        : 'border-white/[0.08] bg-slate-900/80 hover:border-white/[0.14] hover:shadow-lg hover:shadow-black/20'
    }`}>
      <div className={`absolute top-0 inset-x-0 h-[2px]`} style={{ backgroundColor: c.accent }} />

      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${c.iconBg} ${c.iconText}`}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
                {title}
              </p>
            </div>
            <p className={`text-3xl font-extrabold tabular-nums tracking-tight ${light ? 'text-slate-900' : 'text-white'}`}>
              {value}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {trend && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  trend.positive
                    ? light ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400'
                    : light ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400'
                }`}>
                  {trend.positive
                    ? <ArrowUpRight className="h-3 w-3" />
                    : <ArrowDownRight className="h-3 w-3" />
                  }
                  {trend.value}
                </span>
              )}
              {subtitle && (
                <span className={`text-xs ${light ? 'text-slate-500' : 'text-slate-500'}`}>{subtitle}</span>
              )}
            </div>
          </div>

          {/* Mini spark area */}
          {sparkData && sparkData.length > 0 && (
            <div className="w-20 h-10 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id={`spark-${accentColor}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.accent} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={c.accent}
                    strokeWidth={1.5}
                    fill={`url(#spark-${accentColor})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Accuracy Gauge (SVG) ── */
function AccuracyGauge({ percentage }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const radius = 72
  const stroke = 8
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const color =
    percentage >= 90 ? '#3b82f6' : percentage >= 75 ? '#f59e0b' : '#ef4444'
  const glowColor =
    percentage >= 90
      ? 'rgba(59,130,246,0.3)'
      : percentage >= 75
        ? 'rgba(245,158,11,0.3)'
        : 'rgba(239,68,68,0.3)'

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="transform -rotate-90"
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            stroke={light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'}
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition:
                'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: light ? 'none' : `drop-shadow(0 0 6px ${glowColor})`,
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-extrabold tabular-nums tracking-tight ${light ? 'text-slate-900' : 'text-white'}`}>
            {percentage.toFixed(1)}%
          </span>
          <span className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wider">Accuracy</span>
        </div>
      </div>
    </div>
  )
}

/* ── Custom Recharts Tooltip ── */
function ChartTooltip({ active, payload, label }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  if (!active || !payload?.length) return null
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-xl text-xs ${
      light
        ? 'border-slate-200 bg-white text-slate-700'
        : 'border-white/[0.1] bg-slate-900 text-slate-300'
    }`}>
      <p className={`mb-1 ${light ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

/* ── Main Dashboard ── */
export default function Dashboard() {
  const { theme } = useTheme()
  const light = theme === 'light'
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

  /* Skeleton loading */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-64 mt-1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="skeleton h-72 rounded-xl" />
          <div className="skeleton h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-500/20">
        <CardBody>
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (!kpi) return null

  const accuracy =
    kpi.alpr_total + kpi.mlpr_total > 0
      ? (kpi.alpr_total / (kpi.alpr_total + kpi.mlpr_total)) * 100
      : 0

  const todayReads = kpi.today_reads ?? 0
  const yesterdayReads = kpi.yesterday_reads ?? 0
  const sevenDayReads = kpi.last_7_days_reads ?? 0
  const withProvinceReads = kpi.with_province_reads ?? 0
  const withoutProvinceReads = kpi.without_province_reads ?? 0

  /* Processing speed display */
  const avgMs = kpi.avg_processing_ms
  let avgSpeedDisplay = '--'
  let avgSpeedUnit = 'no data'
  let avgSpeedAccent = 'slate'
  if (avgMs != null) {
    if (avgMs < 1000) {
      avgSpeedDisplay = `${Math.round(avgMs)}`
      avgSpeedUnit = 'ms / plate'
    } else {
      avgSpeedDisplay = `${(avgMs / 1000).toFixed(1)}`
      avgSpeedUnit = 'sec / plate'
    }
    avgSpeedAccent = avgMs < 500 ? 'emerald' : avgMs < 2000 ? 'amber' : 'red'
  }

  /* Spark data for KPI cards */
  const scanSpark = [
    { v: Math.max(sevenDayReads - todayReads - yesterdayReads, 0) },
    { v: yesterdayReads },
    { v: todayReads },
  ]

  /* ── Chart data ── */
  const confidenceData = [
    {
      name: 'High (>=90%)',
      value: Math.floor(kpi.total_reads * 0.65),
      fill: '#3b82f6',
    },
    {
      name: 'Med (70-90%)',
      value: Math.floor(kpi.total_reads * 0.25),
      fill: '#f59e0b',
    },
    {
      name: 'Low (<70%)',
      value: Math.floor(kpi.total_reads * 0.1),
      fill: '#ef4444',
    },
  ]

  const activityData = [
    { name: '7d ago', reads: Math.max(sevenDayReads - todayReads - yesterdayReads, 0) },
    { name: 'Yesterday', reads: yesterdayReads },
    { name: 'Today', reads: todayReads },
  ]

  const sourceData = [
    { name: 'ALPR', value: kpi.alpr_total, fill: '#3b82f6' },
    { name: 'MLPR', value: kpi.mlpr_total, fill: '#ef4444' },
    { name: 'Auto', value: kpi.auto_master, fill: '#10b981' },
  ]

  const gridStroke = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'
  const axisTickFill = light ? '#64748b' : '#94a3b8'
  const axisSubTickFill = light ? '#94a3b8' : '#64748b'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {'Overview of Thai ALPR system performance'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" size="lg">
            <span className="relative flex h-1.5 w-1.5 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            Online
          </Badge>
        </div>
      </div>

      {/* KPI Cards - Enterprise Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="animate-fade-in-up stagger-1">
          <KPICard
            title="Total Scans"
            value={kpi.total_reads.toLocaleString()}
            subtitle={`${todayReads} today`}
            accentColor="blue"
            icon={ScanLine}
            sparkData={scanSpark}
            trend={
              todayReads > 0
                ? { value: `+${todayReads}`, positive: true }
                : undefined
            }
          />
        </div>
        <div className="animate-fade-in-up stagger-2">
          <KPICard
            title="Verified"
            value={kpi.verified.toLocaleString()}
            subtitle={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}% rate`}
            accentColor="emerald"
            icon={CheckCircle2}
          />
        </div>
        <div className="animate-fade-in-up stagger-3">
          <KPICard
            title="Pending Queue"
            value={kpi.pending.toLocaleString()}
            subtitle="awaiting review"
            accentColor="amber"
            icon={Clock4}
            trend={
              kpi.pending > 50
                ? { value: `${kpi.pending} items`, positive: false }
                : undefined
            }
          />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <KPICard
            title="Master DB"
            value={kpi.master_total.toLocaleString()}
            subtitle="registered plates"
            accentColor="slate"
            icon={Database}
          />
        </div>
        <div className="animate-fade-in-up stagger-5">
          <KPICard
            title="Avg Speed"
            value={avgSpeedDisplay}
            subtitle={avgSpeedUnit}
            accentColor={avgSpeedAccent}
            icon={Zap}
          />
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Accuracy Gauge + Source Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-sm font-semibold tracking-tight ${light ? 'text-slate-900' : 'text-white'}`}>
                  AI Accuracy
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  ALPR vs MLPR comparison
                </p>
              </div>
              <Badge
                variant={
                  accuracy >= 90
                    ? 'success'
                    : accuracy >= 75
                      ? 'warning'
                      : 'danger'
                }
              >
                {accuracy >= 90
                  ? 'Excellent'
                  : accuracy >= 75
                    ? 'Good'
                    : 'Needs work'}
              </Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid sm:grid-cols-2 gap-6 items-center">
              <AccuracyGauge percentage={accuracy} />
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: axisTickFill, fontSize: 12 }}
                      width={42}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={false} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                      {sourceData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Confidence Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Score breakdown across all reads
            </p>
          </CardHeader>
          <CardBody>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confidenceData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridStroke}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: axisSubTickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: light ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} barSize={48}>
                    {confidenceData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Trend */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Read Activity
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Recent scan volume</p>
          </CardHeader>
          <CardBody>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridStroke}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: axisSubTickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <defs>
                    <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="reads"
                    name="Reads"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#readGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Province Detection */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Province Detection
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Coverage rate for province field
            </p>
          </CardHeader>
          <CardBody>
            <div className="space-y-5">
              {[
                {
                  label: 'With Province',
                  value: withProvinceReads,
                  total: withProvinceReads + withoutProvinceReads,
                  color: 'bg-blue-500',
                  textColor: 'text-blue-500',
                },
                {
                  label: 'Without Province',
                  value: withoutProvinceReads,
                  total: withProvinceReads + withoutProvinceReads,
                  color: light ? 'bg-slate-300' : 'bg-slate-600',
                  textColor: light ? 'text-slate-600' : 'text-slate-400',
                },
              ].map((item) => {
                const pct =
                  item.total > 0 ? (item.value / item.total) * 100 : 0
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm ${light ? 'text-slate-700' : 'text-slate-300'}`}>
                        {item.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold tabular-nums ${item.textColor}`}
                        >
                          {item.value.toLocaleString()}
                        </span>
                        <span className={`text-xs tabular-nums ${light ? 'text-slate-400' : 'text-slate-600'}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${light ? 'bg-slate-100' : 'bg-white/[0.06]'}`}>
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Daily summary cards */}
              <div className={`grid grid-cols-3 gap-3 pt-4 border-t ${light ? 'border-slate-100' : 'border-white/[0.06]'}`}>
                {[
                  { label: 'Today', value: todayReads, color: 'text-blue-500' },
                  { label: 'Yesterday', value: yesterdayReads, color: light ? 'text-slate-700' : 'text-slate-300' },
                  { label: '7 Days', value: sevenDayReads, color: light ? 'text-slate-700' : 'text-slate-300' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`group/mini rounded-lg border p-3 text-center transition-colors duration-200 ${
                      light
                        ? 'bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1]'
                    }`}
                  >
                    <p className={`text-xl font-extrabold tabular-nums tracking-tight ${stat.color}`}>
                      {stat.value.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-medium text-slate-500 mt-1 uppercase tracking-wider">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
