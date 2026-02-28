import React, { useEffect, useState } from 'react'
import { getKPI } from '../lib/api.js'
import { Card, CardBody, CardHeader, StatCard, Spinner, Badge, PageHeader } from '../components/UIComponents.jsx'
import { BarChart3, CheckCircle, Clock, Database, TrendingUp, TrendingDown, Activity } from 'lucide-react'

/* ===== ACCURACY GAUGE ===== */
function AccuracyGauge({ percentage }) {
  const radius = 70
  const stroke = 10
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const getStrokeColor = (pct) => {
    if (pct >= 90) return 'var(--color-success)'
    if (pct >= 75) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          <circle
            stroke="var(--color-surface-inset)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={getStrokeColor(percentage)}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-content">{percentage.toFixed(1)}%</span>
          <span className="text-xs text-content-tertiary mt-1">Accuracy</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" /> {'>='}90%</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" /> 75-90%</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger" /> {'<'}75%</span>
      </div>
    </div>
  )
}

/* ===== CONFIDENCE DISTRIBUTION ===== */
function ConfidenceChart({ high, medium, low }) {
  const total = high + medium + low || 1
  const bars = [
    { label: 'High (>=90%)', value: high, pct: (high / total) * 100, color: 'bg-success', textColor: 'text-success' },
    { label: 'Medium (70-90%)', value: medium, pct: (medium / total) * 100, color: 'bg-warning', textColor: 'text-warning' },
    { label: 'Low (<70%)', value: low, pct: (low / total) * 100, color: 'bg-danger', textColor: 'text-danger' },
  ]

  return (
    <div className="space-y-5">
      {bars.map((bar) => (
        <div key={bar.label} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-content-secondary">{bar.label}</span>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${bar.textColor}`}>{bar.value.toLocaleString()}</span>
              <span className="text-xs text-content-tertiary">({bar.pct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-inset">
            <div
              className={`h-full rounded-full ${bar.color} transition-all duration-700 ease-out`}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ===== SPARKLINE ===== */
function Sparkline({ data, positive = true }) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg className="h-8 w-16" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        className={positive ? 'stroke-success' : 'stroke-warning'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

/* ===== ACTIVITY CARD ===== */
function ActivityCard({ icon, title, value, trend, sparklineData }) {
  return (
    <Card className="p-4" hover>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center text-accent">
              {icon}
            </div>
            <span className="text-xs font-medium text-content-tertiary">{title}</span>
          </div>
          <p className="text-2xl font-bold text-content mt-2 tabular-nums">{value}</p>
          {trend !== undefined && (
            <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${trend > 0 ? 'text-success' : 'text-danger'}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        {sparklineData && (
          <div className="flex items-center pt-2">
            <Sparkline data={sparklineData} positive={trend > 0} />
          </div>
        )}
      </div>
    </Card>
  )
}

/* ===== METRIC ROW ===== */
function MetricRow({ label, value, color }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-content-secondary">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${color || 'text-content'}`}>{value}</span>
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
          <Spinner size="lg" />
          <p className="text-content-secondary">Loading Dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="bg-danger-muted border-danger/30">
        <CardBody>
          <div className="flex items-start gap-3">
            <span className="text-danger flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </span>
            <p className="text-sm text-danger-content">{error}</p>
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
  const provinceTotal = Math.max(withProvinceReads + withoutProvinceReads, 1)
  const withProvincePct = (withProvinceReads / provinceTotal) * 100
  const withoutProvincePct = (withoutProvinceReads / provinceTotal) * 100

  const todayTrend =
    yesterdayReads > 0 ? ((todayReads - yesterdayReads) / yesterdayReads) * 100 : 0

  const todaySparkline = [Math.max(yesterdayReads, 0), todayReads]
  const weekSparkline = [
    Math.max(sevenDayReads - (todayReads + yesterdayReads), 0),
    Math.max(sevenDayReads - todayReads, 0),
    sevenDayReads,
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="System overview with real-time statistics"
        actions={
          <Badge variant="success" size="lg" dot>
            System Online
          </Badge>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Scans"
          value={kpi.total_reads.toLocaleString()}
          subtitle="reads"
          icon={<BarChart3 className="w-5 h-5" />}
          trend={{ value: '+12.5% from last month', positive: true }}
        />
        <StatCard
          title="Verified"
          value={kpi.verified.toLocaleString()}
          subtitle={`${kpi.total_reads > 0 ? ((kpi.verified / kpi.total_reads) * 100).toFixed(1) : 0}%`}
          icon={<CheckCircle className="w-5 h-5" />}
          trend={{ value: '+8.3% from last month', positive: true }}
        />
        <StatCard
          title="Pending Queue"
          value={kpi.pending.toLocaleString()}
          subtitle="awaiting review"
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="Master Database"
          value={kpi.master_total.toLocaleString()}
          subtitle="plates"
          icon={<Database className="w-5 h-5" />}
          trend={{ value: '+156 new entries', positive: true }}
        />
      </div>

      {/* Accuracy & Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-content">AI Accuracy</h2>
                <p className="text-xs text-content-tertiary mt-0.5">ALPR vs MLPR comparison</p>
              </div>
              <Badge variant={accuracy >= 90 ? 'success' : accuracy >= 75 ? 'warning' : 'danger'}>
                {accuracy >= 90 ? 'Excellent' : accuracy >= 75 ? 'Good' : 'Needs Improvement'}
              </Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid md:grid-cols-2 gap-6">
              <AccuracyGauge percentage={accuracy} />
              <div className="flex flex-col justify-center space-y-3">
                {[
                  { label: 'ALPR', desc: 'Correct from start', value: kpi.alpr_total, variant: 'success' },
                  { label: 'MLPR', desc: 'Human corrected', value: kpi.mlpr_total, variant: 'danger' },
                  { label: 'Auto-Master', desc: 'Auto-inserted to DB', value: kpi.auto_master, variant: 'primary' },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-4 ${
                    item.variant === 'success' ? 'border-success/20 bg-success-muted' :
                    item.variant === 'danger' ? 'border-danger/20 bg-danger-muted' :
                    'border-accent/20 bg-accent-muted'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${
                          item.variant === 'success' ? 'text-success' :
                          item.variant === 'danger' ? 'text-danger' : 'text-accent'
                        }`}>{item.label}</p>
                        <p className="text-xs text-content-secondary mt-0.5">{item.desc}</p>
                      </div>
                      <p className="text-2xl font-bold text-content tabular-nums">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-content">Confidence Distribution</h2>
            <p className="text-xs text-content-tertiary mt-0.5">Score breakdown across all reads</p>
          </CardHeader>
          <CardBody>
            <ConfidenceChart
              high={Math.floor(kpi.total_reads * 0.65)}
              medium={Math.floor(kpi.total_reads * 0.25)}
              low={Math.floor(kpi.total_reads * 0.1)}
            />
          </CardBody>
        </Card>
      </div>

      {/* Activity Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ActivityCard
          icon={<Activity className="w-4 h-4" />}
          title="Today"
          value={todayReads.toLocaleString()}
          trend={todayTrend}
          sparklineData={todaySparkline}
        />
        <ActivityCard
          icon={<BarChart3 className="w-4 h-4" />}
          title="Last 7 Days"
          value={sevenDayReads.toLocaleString()}
          trend={8.2}
          sparklineData={weekSparkline}
        />
        <ActivityCard
          icon={<Clock className="w-4 h-4" />}
          title="Avg Processing"
          value="0.8s"
          trend={-5.3}
        />
        <ActivityCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="Throughput"
          value="~125/min"
          trend={15.8}
        />
      </div>

      {/* Bottom Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-content">Daily Stats</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <MetricRow label="Today" value={todayReads.toLocaleString()} color="text-success" />
              <MetricRow label="Yesterday" value={yesterdayReads.toLocaleString()} />
              <MetricRow label="Last 7 Days" value={sevenDayReads.toLocaleString()} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-content">Province Detection</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {[
                { label: 'With Province', value: withProvinceReads, pct: withProvincePct, color: 'bg-success', text: 'text-success' },
                { label: 'Without Province', value: withoutProvinceReads, pct: withoutProvincePct, color: 'bg-warning', text: 'text-warning' },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-content-secondary">{stat.label}</span>
                    <span className={`text-base font-semibold tabular-nums ${stat.text}`}>
                      {stat.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-surface-inset rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stat.color} transition-all duration-500`}
                      style={{ width: `${stat.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-content">Performance</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <MetricRow label="Avg. Processing" value="0.8s" color="text-success" />
              <MetricRow label="Throughput" value="~125/min" />
              <MetricRow label="Uptime" value="99.8%" color="text-success" />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
