import React, { useEffect, useState, useCallback } from 'react'
import { useTheme } from '../lib/ThemeContext.jsx'
import { API_BASE, apiFetch } from '../lib/api.js'
import {
  Card,
  CardBody,
  CardHeader,
  Badge,
  SkeletonCard,
} from '../components/UIComponents.jsx'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  Activity,
  Server,
  Database,
  Cpu,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Layers,
  Gauge,
} from 'lucide-react'

/* ── Status Dot ── */
function StatusDot({ status }) {
  const colors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    offline: 'bg-slate-500',
  }
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'healthy' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors[status]} opacity-50`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[status] || colors.offline}`} />
    </span>
  )
}

/* ── Status Card ── */
function StatusCard({ title, status, value, subtitle, icon: Icon, details, light }) {
  const statusColors = {
    healthy: light ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-500/20 bg-emerald-500/5',
    warning: light ? 'border-amber-200 bg-amber-50' : 'border-amber-500/20 bg-amber-500/5',
    error: light ? 'border-red-200 bg-red-50' : 'border-red-500/20 bg-red-500/5',
    offline: light ? 'border-slate-200 bg-slate-50' : 'border-slate-500/20 bg-slate-500/5',
  }

  const statusText = {
    healthy: light ? 'text-emerald-700' : 'text-emerald-400',
    warning: light ? 'text-amber-700' : 'text-amber-400',
    error: light ? 'text-red-700' : 'text-red-400',
    offline: light ? 'text-slate-500' : 'text-slate-500',
  }

  return (
    <div className={`rounded-xl border p-4 transition-all duration-300 ${
      light
        ? 'border-slate-200 bg-white hover:shadow-md'
        : 'border-white/[0.08] bg-slate-900/80 hover:border-white/[0.14]'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${
            light ? 'bg-slate-100' : 'bg-white/[0.06]'
          }`}>
            <Icon className={`h-4 w-4 ${light ? 'text-slate-600' : 'text-slate-400'}`} />
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
            {title}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColors[status]} ${statusText[status]}`}>
          <StatusDot status={status} />
          {status === 'healthy' ? 'Online' : status === 'warning' ? 'Warning' : status === 'error' ? 'Error' : 'Offline'}
        </div>
      </div>
      {value !== undefined && (
        <p className={`text-2xl font-extrabold tabular-nums tracking-tight ${light ? 'text-slate-900' : 'text-white'}`}>
          {value}
        </p>
      )}
      {subtitle && (
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      )}
      {details && details.length > 0 && (
        <div className={`mt-3 pt-3 border-t space-y-1.5 ${light ? 'border-slate-100' : 'border-white/[0.06]'}`}>
          {details.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{d.label}</span>
              <span className={`font-medium tabular-nums ${light ? 'text-slate-700' : 'text-slate-300'}`}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Resource Gauge ── */
function ResourceGauge({ label, value, max, unit, color, light }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : color

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium ${light ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${light ? 'text-slate-700' : 'text-slate-200'}`}>
          {typeof value === 'number' ? value.toFixed(1) : value} {unit}
        </span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${light ? 'bg-slate-100' : 'bg-white/[0.06]'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-500 mt-0.5 text-right">
        {pct.toFixed(0)}% of {max}{unit}
      </p>
    </div>
  )
}

/* ── Alert Log Item ── */
function AlertItem({ alert, light }) {
  const icons = {
    info: <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-400" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  }

  return (
    <div className={`flex items-start gap-2.5 py-2 px-3 rounded-lg transition-colors ${
      light ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'
    }`}>
      <div className="mt-0.5 flex-shrink-0">{icons[alert.level] || icons.info}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${light ? 'text-slate-700' : 'text-slate-300'}`}>{alert.message}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{alert.timestamp}</p>
      </div>
    </div>
  )
}

/* ── Chart Tooltip ── */
function MonitorTooltip({ active, payload, label, light }) {
  if (!active || !payload?.length) return null
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-xl text-xs ${
      light
        ? 'border-slate-200 bg-white text-slate-700'
        : 'border-white/[0.1] bg-slate-900 text-slate-300'
    }`}>
      <p className="text-slate-500 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

function formatLatency(ms) {
  if (ms == null || Number.isNaN(ms)) return 'N/A'
  if (ms < 1000) return `${ms.toFixed(1)}ms`

  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(2)}s`

  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(2)}m`

  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(2)}h`

  const days = hours / 24
  return `${days.toFixed(2)}d`
}

function queuePressureLabel(pendingReads) {
  if (pendingReads > 500) return 'Critical'
  if (pendingReads > 200) return 'High'
  if (pendingReads > 50) return 'Moderate'
  return 'Low'
}

/* ========== MAIN PAGE ========== */
export default function SystemMonitor() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [history, setHistory] = useState([])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/monitor/health`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      setHealth(data)
      setError('')
      setLastUpdate(new Date())

      // Add to rolling history
      setHistory((prev) => {
        const entry = {
          time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' }),
          processingMs: data.throughput?.avg_processing_ms ?? 0,
          pendingReads: data.queue_length ?? 0,
        }
        const next = [...prev, entry]
        return next.slice(-20) // keep last 20 data points
      })
    } catch (e) {
      setError(String(e))
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000) // poll every 10s
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading && !health) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72 mt-1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  const database = health?.database
  const throughput = health?.throughput
  const cameras = health?.cameras || []
  const resources = health?.resources || health?.system_resources

  const uptimeLabel = health?.uptime_seconds != null
    ? `${Math.floor(health.uptime_seconds / 3600)}h ${Math.floor((health.uptime_seconds % 3600) / 60)}m`
    : 'N/A'

  const cameraSummary = {
    online: cameras.filter((cam) => cam.enabled).length,
    offline: cameras.filter((cam) => !cam.enabled).length,
  }

  const workerSummary = {
    // active_workers comes from Celery inspector (null when broker unreachable)
    active: health?.active_workers ?? null,
    // Use DB pending_reads as the authoritative queue depth
    queued: database?.pending_reads || 0,
  }

  const resourceSummary = resources
    ? {
        cpuPercent: resources.cpu_percent ?? 0,
        memoryUsedGb: resources.memory_used_gb
          ?? (typeof resources.memory_total === 'number' && typeof resources.memory_available === 'number'
            ? (resources.memory_total - resources.memory_available) / (1024 ** 3)
            : null),
        memoryTotalGb: resources.memory_total_gb
          ?? (typeof resources.memory_total === 'number' ? resources.memory_total / (1024 ** 3) : null),
        memoryPercent: resources.memory_percent,
        diskUsedGb: resources.disk_used_gb ?? null,
        diskTotalGb: resources.disk_total_gb ?? null,
        diskPercent: resources.disk_percent,
        gpuPercent: resources.gpu_percent,
      }
    : null

  const avgReadRatePerMinute = (throughput?.reads_last_hour || 0) / 60
  const queueDrainMinutes = avgReadRatePerMinute > 0 ? workerSummary.queued / avgReadRatePerMinute : null

  // 'error' only when latency is genuinely broken (> 30 s after outlier filtering)
  // 'warning' when slow but still processing (> 5 s)
  // null / undefined means no recent data — show as 'offline'
  const processingStatus =
    throughput?.avg_processing_ms == null
      ? 'offline'
      : throughput.avg_processing_ms > 30000
        ? 'error'
        : throughput.avg_processing_ms > 5000
          ? 'warning'
          : 'healthy'

  // Workers are "stuck" when the queue is large but nothing has been
  // processed in the last hour — that is the genuine error condition.
  // A large queue alone (backlog) is only a warning, not a system error.
  const workersStuck =
    workerSummary.queued > 100 && (throughput?.reads_last_hour ?? 0) === 0

  const queueStatus = workersStuck
    ? 'error'
    : workerSummary.queued > 500
      ? 'warning'
      : workerSummary.queued > 100
        ? 'warning'
        : 'healthy'

  const overallStatus = error
    ? 'error'
    : [processingStatus, queueStatus].includes('error')
      ? 'error'
      : [processingStatus, queueStatus].includes('warning') || (cameraSummary.offline || 0) > 0
        ? 'warning'
        : database && throughput
          ? 'healthy'
          : 'warning'

  const alerts = []
  if (workerSummary.queued > 200) {
    alerts.push({
      level: 'warning',
      message: `Processing queue backlog is high (${workerSummary.queued.toLocaleString()})`,
      timestamp: 'now',
    })
  }
  if ((cameraSummary.offline || 0) > 0) {
    alerts.push({
      level: 'warning',
      message: `${cameraSummary.offline} camera(s) disabled or offline`,
      timestamp: 'now',
    })
  }
  if ((throughput?.avg_processing_ms || 0) > 10000) {
    alerts.push({
      level: 'error',
      message: `Inference latency is very high (${formatLatency(throughput.avg_processing_ms)})`,
      timestamp: 'now',
    })
  }

  const gridStroke = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'
  const axisFill = light ? '#64748b' : '#94a3b8'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">
            Real-time monitoring of ALPR system components
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            overallStatus === 'healthy'
              ? light ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : overallStatus === 'warning'
                ? light ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                : light ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}>
            <StatusDot status={overallStatus} />
            {overallStatus === 'healthy' ? 'All Systems Operational' : overallStatus === 'warning' ? 'Degraded' : 'Issues Detected'}
          </div>
          {lastUpdate && (
            <span className={`text-xs tabular-nums ${light ? 'text-slate-400' : 'text-slate-600'}`}>
              {lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' })}
            </span>
          )}
          <button
            onClick={fetchHealth}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              light
                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border border-white/[0.1] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          light
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
        }`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Unable to reach monitoring endpoint. Data shown below is from the latest successful poll.</span>
          </div>
        </div>
      )}

      {/* Status Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="API Health"
          status={error ? 'error' : 'healthy'}
          value={formatLatency(throughput?.avg_processing_ms)}
          subtitle="Avg processing time"
          icon={Activity}
          light={light}
          details={[
            { label: 'Uptime', value: uptimeLabel },
            { label: 'Python', value: health?.python_version || 'N/A' },
          ]}
        />
        <StatusCard
          title="Database"
          status={database ? 'healthy' : 'offline'}
          value={database?.total_reads?.toLocaleString() || 'N/A'}
          subtitle="Total plate reads"
          icon={Database}
          light={light}
          details={[
            { label: 'Pending Verification', value: database?.pending_reads?.toLocaleString() || '0' },
            { label: 'Verified', value: database?.verified_reads?.toLocaleString() || '0' },
          ]}
        />
        <StatusCard
          title="Processing Queue"
          status={queueStatus}
          value={workerSummary.queued.toLocaleString()}
          subtitle="Pending reads"
          icon={Layers}
          light={light}
          details={[
            { label: 'Reads Last Hour', value: throughput?.reads_last_hour?.toLocaleString() || '0' },
            { label: 'Reads Today', value: throughput?.reads_today?.toLocaleString() || '0' },
            { label: 'Queue Pressure', value: queuePressureLabel(workerSummary.queued) },
            { label: 'Est. Catch-up', value: queueDrainMinutes != null ? formatLatency(queueDrainMinutes * 60 * 1000) : 'N/A' },
          ]}
        />
        <StatusCard
          title="Inference Speed"
          status={processingStatus}
          value={formatLatency(throughput?.avg_processing_ms)}
          subtitle="Avg read-to-inference time"
          icon={Gauge}
          light={light}
          details={[
            { label: 'Workers Active', value: workerSummary.active ?? 'N/A' },
            { label: 'Total Captures', value: database?.total_captures?.toLocaleString() || 'N/A' },
          ]}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Latency Trend */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Processing Latency
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Average processing time (polled every 10s)</p>
          </CardHeader>
          <CardBody>
            <div className="h-48">
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: axisFill, fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
                    <Tooltip content={<MonitorTooltip light={light} />} />
                    <defs>
                      <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="processingMs" name="Processing (ms)" stroke="#3b82f6" strokeWidth={2} fill="url(#latGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-500">
                  Collecting data... Chart will appear after a few data points.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Pending Reads Trend */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Pending Reads
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Pending read queue size over time</p>
          </CardHeader>
          <CardBody>
            <div className="h-48">
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: axisFill, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: axisFill, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<MonitorTooltip light={light} />} />
                    <defs>
                      <linearGradient id="queueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="pendingReads" name="Pending Reads" stroke="#f59e0b" strokeWidth={2} fill="url(#queueGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-500">
                  Collecting data... Chart will appear after a few data points.
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Workers + Resources + Cameras */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Workers */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              AI Workers
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Inference worker status</p>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className={`rounded-lg border p-3 ${
                light ? 'border-slate-100 bg-slate-50' : 'border-white/[0.06] bg-white/[0.02]'
              }`}>
                <p className="text-[11px] text-slate-500">Pending Reads</p>
                <p className={`text-base font-semibold ${light ? 'text-slate-700' : 'text-slate-200'}`}>
                  {workerSummary.queued.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-lg border p-3 ${
                light ? 'border-slate-100 bg-slate-50' : 'border-white/[0.06] bg-white/[0.02]'
              }`}>
                <p className="text-[11px] text-slate-500">Throughput (last hour)</p>
                <p className={`text-base font-semibold ${light ? 'text-slate-700' : 'text-slate-200'}`}>
                  {throughput?.reads_last_hour?.toLocaleString() || '0'} reads
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Server className="h-3.5 w-3.5" />
                Worker-level telemetry is not provided by the backend endpoint yet.
              </div>
            </div>
          </CardBody>
        </Card>

        {/* System Resources */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              System Resources
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">CPU, memory, disk usage</p>
          </CardHeader>
          <CardBody>
            {resourceSummary ? (
              <div className="space-y-4">
                <ResourceGauge
                  label="CPU"
                  value={resourceSummary.cpuPercent}
                  max={100}
                  unit="%"
                  color="bg-blue-500"
                  light={light}
                />
                {resourceSummary.memoryTotalGb != null ? (
                  <ResourceGauge
                    label="Memory"
                    value={resourceSummary.memoryUsedGb ?? 0}
                    max={resourceSummary.memoryTotalGb}
                    unit="GB"
                    color="bg-emerald-500"
                    light={light}
                  />
                ) : resourceSummary.memoryPercent != null ? (
                  <ResourceGauge
                    label="Memory"
                    value={resourceSummary.memoryPercent}
                    max={100}
                    unit="%"
                    color="bg-emerald-500"
                    light={light}
                  />
                ) : null}
                {resourceSummary.diskTotalGb != null ? (
                  <ResourceGauge
                    label="Disk"
                    value={resourceSummary.diskUsedGb ?? 0}
                    max={resourceSummary.diskTotalGb}
                    unit="GB"
                    color="bg-amber-500"
                    light={light}
                  />
                ) : resourceSummary.diskPercent != null ? (
                  <ResourceGauge
                    label="Disk"
                    value={resourceSummary.diskPercent}
                    max={100}
                    unit="%"
                    color="bg-amber-500"
                    light={light}
                  />
                ) : null}
                {resourceSummary.gpuPercent != null && (
                  <ResourceGauge
                    label="GPU"
                    value={resourceSummary.gpuPercent}
                    max={100}
                    unit="%"
                    color="bg-purple-500"
                    light={light}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Cpu className={`h-8 w-8 mb-2 ${light ? 'text-slate-300' : 'text-slate-600'}`} />
                <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-500'}`}>
                  No resource data available. Backend can expose system metrics via psutil.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Camera Status */}
        <Card>
          <CardHeader>
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Cameras
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Connected camera streams</p>
          </CardHeader>
          <CardBody>
            {cameras.length > 0 ? (
              <div className="space-y-2.5">
                {cameras.map((cam, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg border p-3 ${
                    light ? 'border-slate-100 bg-slate-50' : 'border-white/[0.06] bg-white/[0.02]'
                  }`}>
                    <div className="flex items-center gap-2">
                      {cam.enabled ? (
                        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className={`text-xs font-medium ${light ? 'text-slate-700' : 'text-slate-300'}`}>{cam.name || `Camera ${i + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {cam.last_capture && <span className="text-[10px] text-slate-500">Last: {new Date(cam.last_capture).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}</span>}
                      <span className={`text-[10px] font-semibold uppercase ${
                        cam.enabled ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {cam.enabled ? 'online' : 'offline'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Wifi className={`h-8 w-8 mb-2 ${light ? 'text-slate-300' : 'text-slate-600'}`} />
                <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-500'}`}>
                  No camera data available. Connect cameras via RTSP settings.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Alerts/Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
                Recent Alerts & Logs
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">System events ordered by most recent</p>
            </div>
            <Badge variant="default" size="sm">{alerts.length} events</Badge>
          </div>
        </CardHeader>
        <CardBody>
          {alerts.length > 0 ? (
            <div className={`divide-y ${light ? 'divide-slate-100' : 'divide-white/[0.06]'} max-h-64 overflow-y-auto`}>
              {alerts.map((alert, i) => (
                <AlertItem key={i} alert={alert} light={light} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className={`h-8 w-8 mb-2 ${light ? 'text-emerald-400' : 'text-emerald-500/50'}`} />
              <p className={`text-sm font-medium ${light ? 'text-slate-700' : 'text-slate-300'}`}>No alerts</p>
              <p className="text-xs text-slate-500 mt-0.5">System is running smoothly. Alerts will appear here when issues are detected.</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
