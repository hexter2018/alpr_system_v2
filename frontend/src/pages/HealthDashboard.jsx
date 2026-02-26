import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Spinner, StatCard } from '../components/UIComponents.jsx'
import { API_BASE } from '../lib/api.js'

/* ===== CAMERA HEALTH CARD ===== */
function CameraHealthCard({ camera }) {
  const getUptimeColor = (uptime) => {
    if (uptime >= 95) return 'text-emerald-400'
    if (uptime >= 80) return 'text-amber-400'
    return 'text-rose-400'
  }

  return (
    <Card hover className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="font-semibold text-slate-100 text-sm">{camera.name || camera.camera_id}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{camera.camera_id}</p>
        </div>
        <Badge variant={camera.status === 'ONLINE' ? 'success' : 'danger'} size="sm">
          {camera.status === 'ONLINE' ? (
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : null}
          {camera.status || 'OFFLINE'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-400 mb-1">FPS</div>
          <div className="font-semibold text-slate-100">
            {camera.fps !== null && camera.fps !== undefined ? camera.fps.toFixed(1) : '-'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-slate-400 mb-1">Uptime</div>
          <div className={`font-semibold ${getUptimeColor(camera.uptime || 0)}`}>
            {camera.uptime !== null && camera.uptime !== undefined ? `${camera.uptime.toFixed(1)}%` : '-'}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-slate-400 mb-1">Reads</div>
          <div className="font-semibold text-slate-100">
            {camera.total_reads || 0}
          </div>
        </div>
      </div>

      {camera.last_seen && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <div className="text-xs text-slate-400">
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
function MetricsChart({ data, label, color = 'emerald' }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-slate-500 text-sm">
        No data available
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.value), 1)
  const colors = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500'
  }

  return (
    <div>
      <div className="text-xs text-slate-400 mb-3">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {data.map((point, i) => {
          const height = (point.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div 
                className={`w-full ${colors[color]} rounded-t transition-all duration-300 hover:opacity-80`}
                style={{ height: `${height}%` }}
              />
              <div className="absolute -top-8 hidden group-hover:block bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs">
                {point.value.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
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
    const interval = setInterval(loadHealthData, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  async function loadHealthData() {
    try {
      // System health
      const systemRes = await fetch(`${API_BASE}/api/health/system`)
      if (systemRes.ok) {
        const systemData = await systemRes.json()
        setSystemHealth(systemData)
      }

      // Camera health
      const cameraRes = await fetch(`${API_BASE}/api/health/cameras`)
      if (cameraRes.ok) {
        const cameraData = await cameraRes.json()
        setCameraHealth(cameraData)
      }

      // Worker health
      const workerRes = await fetch(`${API_BASE}/api/health/workers`)
      if (workerRes.ok) {
        const workerData = await workerRes.json()
        setWorkerHealth(workerData)
      }

      // Metrics (last 1 hour)
      const metricsRes = await fetch(`${API_BASE}/api/health/metrics?hours=1`)
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        
        // Group metrics by type
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" className="text-blue-500" />
        <span className="ml-3 text-slate-300">Loading health data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-teal-500/10">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">System Health</h1>
              <p className="text-sm text-slate-300 mt-1">
                Real-time monitoring of cameras, workers, and processing queue
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <Badge variant="default" size="sm">
                  Updated: {lastUpdate.toLocaleTimeString('th-TH', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </Badge>
              )}
              <Badge variant="success" size="lg">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live
              </Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card className="bg-rose-500/10 border-rose-300/40">
          <CardBody>
            <p className="text-rose-200">{error}</p>
          </CardBody>
        </Card>
      )}

      {/* System Overview */}
      {systemHealth && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Cameras Online"
            value={`${systemHealth.cameras_online || 0}/${systemHealth.total_cameras || 0}`}
            icon="📹"
            gradient="from-emerald-900/40 to-emerald-900/20"
            trend={systemHealth.cameras_online === systemHealth.total_cameras ? { value: "All online", positive: true } : undefined}
          />
          
          <StatCard
            title="Queue Depth"
            value={systemHealth.queue_depth || 0}
            subtitle="pending"
            icon="⏳"
            gradient="from-blue-900/40 to-blue-900/20"
          />
          
          <StatCard
            title="Reads Today"
            value={(systemHealth.recent_reads || 0).toLocaleString()}
            icon="📊"
            gradient="from-teal-900/40 to-teal-900/20"
          />
          
          <StatCard
            title="Avg Confidence"
            value={systemHealth.avg_confidence ? `${(systemHealth.avg_confidence * 100).toFixed(1)}%` : '-'}
            icon="✓"
            gradient="from-green-900/40 to-green-900/20"
          />
        </div>
      )}

      {/* Alerts */}
      {systemHealth?.unacknowledged_alerts > 0 && (
        <Card className="bg-rose-500/10 border-rose-300/40">
          <CardBody>
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="font-semibold text-rose-200">
                  {systemHealth.unacknowledged_alerts} Unacknowledged Alert{systemHealth.unacknowledged_alerts > 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-rose-300 mt-1">
                  Watchlist matches require attention. <a href="/watchlist" className="underline">View alerts →</a>
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Camera Health Grid */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-slate-100">Camera Status</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {cameraHealth.length} camera{cameraHealth.length !== 1 ? 's' : ''} monitored
          </p>
        </CardHeader>
        <CardBody>
          {cameraHealth.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No cameras configured
            </div>
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
            <h3 className="text-base font-semibold text-slate-100">Average FPS</h3>
            <p className="text-xs text-slate-400 mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart 
              data={metrics.fps} 
              label="Frames per second"
              color="emerald"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-slate-100">Queue Depth</h3>
            <p className="text-xs text-slate-400 mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart 
              data={metrics.queue} 
              label="Pending tasks"
              color="blue"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-slate-100">Processing Latency</h3>
            <p className="text-xs text-slate-400 mt-0.5">Last hour</p>
          </CardHeader>
          <CardBody>
            <MetricsChart 
              data={metrics.latency} 
              label="Seconds per task"
              color="amber"
            />
          </CardBody>
        </Card>
      </div>

      {/* Worker Health */}
      {workerHealth.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-100">Worker Health</h2>
          </CardHeader>
          <CardBody>
            <div className="divide-y divide-slate-700/50">
              {workerHealth.map((worker, i) => (
                <div key={i} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-100 text-sm">{worker.worker_id}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {worker.tasks_completed || 0} tasks completed
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-100">
                      {worker.avg_latency ? `${worker.avg_latency.toFixed(2)}s` : '-'}
                    </div>
                    <div className="text-xs text-slate-400">avg latency</div>
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