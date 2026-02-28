import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Spinner, StatCard, PageHeader, EmptyState } from '../components/UIComponents.jsx'
import { API_BASE, apiFetch } from '../lib/api.js'
import { Activity, Camera, Cpu, Clock, Gauge, BarChart3, Zap, AlertTriangle, Wifi, WifiOff } from 'lucide-react'

/* ===== CAMERA HEALTH CARD ===== */
function CameraHealthCard({ camera }) {
  const getUptimeColor = (uptime) => {
    if (uptime >= 95) return 'text-success'
    if (uptime >= 80) return 'text-warning'
    return 'text-danger'
  }

  return (
    <Card hover className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-content text-sm truncate">{camera.name || camera.camera_id}</h4>
          <p className="text-xs text-content-tertiary mt-0.5 font-mono">{camera.camera_id}</p>
        </div>
        <Badge
          variant={camera.status === 'ONLINE' ? 'success' : 'danger'}
          size="sm"
          dot
        >
          {camera.status || 'OFFLINE'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-content-tertiary mb-1 flex items-center gap-1">
            <Gauge className="w-3 h-3" /> FPS
          </div>
          <div className="font-bold text-content tabular-nums">
            {camera.fps !== null && camera.fps !== undefined ? camera.fps.toFixed(1) : '-'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-content-tertiary mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Uptime
          </div>
          <div className={`font-bold tabular-nums ${getUptimeColor(camera.uptime || 0)}`}>
            {camera.uptime !== null && camera.uptime !== undefined ? `${camera.uptime.toFixed(1)}%` : '-'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-content-tertiary mb-1 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Reads
          </div>
          <div className="font-bold text-content tabular-nums">
            {camera.total_reads || 0}
          </div>
        </div>
      </div>

      {camera.last_seen && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-xs text-content-tertiary flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Last seen: {new Date(camera.last_seen).toLocaleString('th-TH', { 
              timeZone: 'Asia/Bangkok',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

/* ===== METRICS CHART ===== */
function MetricsChart({ data, label, color = 'accent' }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-content-tertiary text-sm">
        No data available
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.value), 1)
  const colors = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger'
  }

  return (
    <div>
      <div className="text-xs text-content-tertiary mb-3">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {data.map((point, i) => {
          const height = (point.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div 
                className={`w-full ${colors[color] || colors.accent} rounded-t transition-all duration-300 hover:opacity-80`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <div className="absolute -top-9 hidden group-hover:block bg-content text-content-inverse px-2 py-1 rounded-lg text-xs font-mono z-10 shadow-lg">
                {point.value.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-content-tertiary mt-2">
        <span>{data[0]?.timestamp ? new Date(data[0].timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        <span>{data[data.length - 1]?.timestamp ? new Date(data[data.length - 1].timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>
    </div>
  )
}

/* ===== MAIN HEALTH DASHBOARD ===== */
export default function HealthDashboard() {
  const [systemHealth, setSystemHealth] = useState(null)
  const [cameraHealth, setCameraHealth] = useState([])
  const [workerHealth, setWorkerHealth] = useState([])
  const [metrics, setMetrics] = useState({ fps: [], queue: [], latency: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    loadHealthData()
    const interval = setInterval(loadHealthData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadHealthData() {
    try {
      const systemRes = await apiFetch(`${API_BASE}/api/health/system`)
      if (systemRes.ok) {
        const systemData = await systemRes.json()
        setSystemHealth(systemData)
      }

      const cameraRes = await apiFetch(`${API_BASE}/api/health/cameras`)
      if (cameraRes.ok) {
        const cameraData = await cameraRes.json()
        setCameraHealth(cameraData)
      }

      const workerRes = await apiFetch(`${API_BASE}/api/health/workers`)
      if (workerRes.ok) {
        const workerData = await workerRes.json()
        setWorkerHealth(workerData)
      }

      const metricsRes = await apiFetch(`${API_BASE}/api/health/metrics?hours=1`)
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        const fps = metricsData.filter(m => m.metric_type === 'camera_fps')
        const queue = metricsData.filter(m => m.metric_type === 'queue_depth')
        const latency = metricsData.filter(m => m.metric_type === 'worker_latency')
        setMetrics({ fps, queue, latency })
      }

      setLastUpdate(new Date())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !systemHealth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner size="lg" />
        <span className="text-content-secondary">Loading health data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Real-time monitoring of cameras, workers, and processing queue"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <Badge variant="default" size="sm">
                <Clock className="w-3 h-3" />
                {lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Badge>
            )}
            <Badge variant="success" size="lg" dot>
              Live
            </Badge>
          </div>
        }
      />

      {error && (
        <Card className="border-danger/30 bg-danger-muted">
          <CardBody>
            <div className="flex items-center gap-2 text-danger-content">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* System Overview */}
      {systemHealth && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Cameras Online"
            value={`${systemHealth.cameras_online || 0}/${systemHealth.total_cameras || 0}`}
            icon={<Camera className="w-5 h-5" />}
            trend={systemHealth.cameras_online === systemHealth.total_cameras ? { value: 'All online', positive: true } : undefined}
          />
          <StatCard
            title="Queue Depth"
            value={systemHealth.queue_depth || 0}
            subtitle="pending"
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            title="Reads Today"
            value={(systemHealth.recent_reads || 0).toLocaleString()}
            icon={<BarChart3 className="w-5 h-5" />}
          />
          <StatCard
            title="Avg Confidence"
            value={systemHealth.avg_confidence ? `${(systemHealth.avg_confidence * 100).toFixed(1)}%` : '-'}
            icon={<Zap className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Unacknowledged Alerts */}
      {systemHealth?.unacknowledged_alerts > 0 && (
        <Card className="border-danger/30 bg-danger-muted">
          <CardBody>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-danger-content">
                  {systemHealth.unacknowledged_alerts} Unacknowledged Alert{systemHealth.unacknowledged_alerts > 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-danger-content/80 mt-1">
                  Watchlist matches require attention.{' '}
                  <a href="/watchlist" className="underline font-medium hover:no-underline">View alerts</a>
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Camera Health Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-content">Camera Status</h2>
              <p className="text-xs text-content-tertiary mt-0.5">
                {cameraHealth.length} camera{cameraHealth.length !== 1 ? 's' : ''} monitored
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-content-tertiary">
              <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-success" /> Online: {cameraHealth.filter(c => c.status === 'ONLINE').length}</span>
              <span className="flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5 text-danger" /> Offline: {cameraHealth.filter(c => c.status !== 'ONLINE').length}</span>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {cameraHealth.length === 0 ? (
            <EmptyState
              icon={<Camera className="w-8 h-8" />}
              title="No cameras configured"
              description="Add cameras in the Camera Settings page to start monitoring."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cameraHealth.map(camera => (
                <CameraHealthCard key={camera.camera_id} camera={camera} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Metrics Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-content flex items-center gap-2">
              <Gauge className="w-4 h-4 text-accent" /> Average FPS
            </h3>
            <p className="text-xs text-content-tertiary mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart data={metrics.fps} label="Frames per second" color="accent" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-content flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-warning" /> Queue Depth
            </h3>
            <p className="text-xs text-content-tertiary mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart data={metrics.queue} label="Pending tasks" color="warning" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-content flex items-center gap-2">
              <Zap className="w-4 h-4 text-success" /> Processing Latency
            </h3>
            <p className="text-xs text-content-tertiary mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart data={metrics.latency} label="Seconds per task" color="success" />
          </CardBody>
        </Card>
      </div>

      {/* Worker Health */}
      {workerHealth.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-content flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" /> Worker Health
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {workerHealth.map((worker, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-surface-overlay/50 transition-colors">
                  <div>
                    <div className="font-medium text-content text-sm">{worker.worker_id}</div>
                    <div className="text-xs text-content-tertiary mt-1">
                      {worker.tasks_completed || 0} tasks completed
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-content tabular-nums">
                      {worker.avg_latency ? `${worker.avg_latency.toFixed(2)}s` : '-'}
                    </div>
                    <div className="text-xs text-content-tertiary">avg latency</div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
