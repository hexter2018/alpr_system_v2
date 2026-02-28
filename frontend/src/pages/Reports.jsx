import React, { useState, useEffect } from 'react'
import { absImageUrl, API_BASE, apiFetch } from '../lib/api.js'
import {
  Card, CardBody, CardHeader, Badge, Button, Input, Spinner,
  PageHeader, Modal,
} from '../components/UIComponents.jsx'
import {
  Search, Download, Calendar, MapPin, Camera as CameraIcon,
  FileText, CheckCircle, AlertTriangle, XCircle, Eye,
} from 'lucide-react'

function formatBangkokDateTime(value) {
  if (!value) return '-'
  const raw = String(value)
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

/* ===== INLINE STAT ===== */
function ReportStat({ title, value, variant = 'default', icon }) {
  const variantStyles = {
    default: '',
    success: 'border-success/20 hover:border-success/40',
    danger: 'border-danger/20 hover:border-danger/40',
  }

  const iconStyles = {
    default: 'bg-accent-muted text-accent',
    success: 'bg-success-muted text-success',
    danger: 'bg-danger-muted text-danger',
  }

  return (
    <Card className={`p-5 group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold text-content-tertiary mb-2">{title}</p>
          <p className="text-3xl font-extrabold text-content mt-1 tabular-nums tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${iconStyles[variant]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ===== MAIN REPORTS ===== */
export default function Reports() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [province, setProvince] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [accuracy, setAccuracy] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [previewImg, setPreviewImg] = useState(null)

  useEffect(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [])

  async function fetchStats() {
    setLoading(true)
    setErr('')
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      if (province) params.append('province', province)
      if (cameraId) params.append('camera_id', cameraId)

      const res = await apiFetch(`${API_BASE}/api/reports/stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)

      const actRes = await apiFetch(`${API_BASE}/api/reports/activity?${params}&limit=50`)
      if (actRes.ok) {
        const actData = await actRes.json()
        setActivity(actData)
      }

      const accRes = await apiFetch(`${API_BASE}/api/reports/accuracy?days=7`)
      if (accRes.ok) {
        const accData = await accRes.json()
        setAccuracy(accData)
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (startDate && endDate) {
      fetchStats()
    }
  }, [startDate, endDate, province, cameraId])

  function exportCSV() {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (province) params.append('province', province)
    if (cameraId) params.append('camera_id', cameraId)
    window.open(`${API_BASE}/api/reports/export?${params}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Historical detection statistics and activity logs"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="w-4 h-4" />}
            onClick={exportCSV}
            disabled={!stats}
          >
            Export CSV
          </Button>
        }
      />

      {err && (
        <Card className="bg-danger-muted border-danger/30">
          <CardBody>
            <p className="text-sm text-danger-content flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">Filters</h2>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Start Date"
              type="date"
              icon={<Calendar className="w-4 h-4" />}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End Date"
              type="date"
              icon={<Calendar className="w-4 h-4" />}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Input
              label="Province"
              type="text"
              placeholder="e.g. Bangkok"
              icon={<MapPin className="w-4 h-4" />}
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            />
            <Input
              label="Camera ID"
              type="text"
              placeholder="e.g. plaza2-lane1"
              icon={<CameraIcon className="w-4 h-4" />}
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={fetchStats} loading={loading} icon={<Search className="w-4 h-4" />}>
              Search
            </Button>
          </div>
        </CardBody>
      </Card>

      {stats && (
        <>
          {/* KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportStat title="Total Reads" value={stats.total_reads.toLocaleString()} icon={<FileText className="w-5 h-5" />} />
            <ReportStat title="Verified" value={stats.verified_reads.toLocaleString()} icon={<CheckCircle className="w-5 h-5" />} />
            <ReportStat title="ALPR (Correct)" value={stats.alpr_total.toLocaleString()} variant="success" icon={<CheckCircle className="w-5 h-5" />} />
            <ReportStat title="MLPR (Corrected)" value={stats.mlpr_total.toLocaleString()} variant="danger" icon={<AlertTriangle className="w-5 h-5" />} />
          </div>

          {/* Accuracy + Top Provinces */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-content">Accuracy: {stats.accuracy.toFixed(1)}%</h2>
                  <Badge variant={stats.accuracy >= 90 ? 'success' : stats.accuracy >= 75 ? 'warning' : 'danger'}>
                    {stats.accuracy >= 90 ? 'Excellent' : stats.accuracy >= 75 ? 'Good' : 'Needs Work'}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  {[
                    { label: 'High Confidence (>=90%)', value: stats.high_confidence, total: stats.total_reads, color: 'bg-success', text: 'text-success' },
                    { label: 'Medium (70-90%)', value: stats.medium_confidence, total: stats.total_reads, color: 'bg-warning', text: 'text-warning' },
                    { label: 'Low (<70%)', value: stats.low_confidence, total: stats.total_reads, color: 'bg-danger', text: 'text-danger' },
                  ].map((bar) => (
                    <div key={bar.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-content-secondary">{bar.label}</span>
                        <span className={`font-semibold ${bar.text}`}>{bar.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-inset">
                        <div
                          className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                          style={{ width: `${(bar.value / Math.max(bar.total, 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-content">Top 10 Provinces</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-2.5">
                  {stats.top_provinces.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-overlay/50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] font-bold w-6 h-6 rounded-lg flex items-center justify-center tabular-nums ${
                          i === 0 ? 'bg-accent-muted text-accent' : i === 1 ? 'bg-surface-overlay text-content-secondary' : i === 2 ? 'bg-surface-overlay text-content-secondary' : 'text-content-tertiary'
                        }`}>{i + 1}</span>
                        <span className="text-sm font-medium text-content">{p.province || 'Unknown'}</span>
                      </div>
                      <span className="text-sm font-bold text-content tabular-nums">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Accuracy Table */}
          {accuracy.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-content">Daily Accuracy</h2>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Date</th>
                      <th className="px-5 py-3 text-right text-xs uppercase tracking-wider font-semibold text-content-tertiary">ALPR</th>
                      <th className="px-5 py-3 text-right text-xs uppercase tracking-wider font-semibold text-content-tertiary">MLPR</th>
                      <th className="px-5 py-3 text-right text-xs uppercase tracking-wider font-semibold text-content-tertiary">Total</th>
                      <th className="px-5 py-3 text-right text-xs uppercase tracking-wider font-semibold text-content-tertiary">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {accuracy.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-overlay/50 transition-colors">
                        <td className="px-5 py-3 text-content">{row.date}</td>
                        <td className="px-5 py-3 text-right text-success tabular-nums font-medium">{row.alpr}</td>
                        <td className="px-5 py-3 text-right text-danger tabular-nums font-medium">{row.mlpr}</td>
                        <td className="px-5 py-3 text-right text-content tabular-nums font-medium">{row.total}</td>
                        <td className="px-5 py-3 text-right">
                          <Badge variant={row.accuracy >= 90 ? 'success' : row.accuracy >= 75 ? 'warning' : 'danger'} size="sm">
                            {row.accuracy.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Activity Log */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-content">Activity Log</h2>
                <Badge variant="default" size="sm">{activity.length} entries</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Plate Crop</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Plate Text</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Province</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Confidence</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Status</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Camera</th>
                    <th className="px-5 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-overlay/50 transition-colors">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setPreviewImg(absImageUrl(a.crop_url))}
                          className="block rounded-lg overflow-hidden border border-border hover:border-accent/50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
                        >
                          <img
                            src={absImageUrl(a.crop_url)}
                            alt="plate crop"
                            className="h-12 w-20 object-cover"
                            crossOrigin="anonymous"
                          />
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-base font-bold text-content">{a.plate_text || '-'}</span>
                      </td>
                      <td className="px-5 py-3 text-content-secondary">{a.province || '-'}</td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={a.confidence >= 0.9 ? 'success' : a.confidence >= 0.7 ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {(a.confidence * 100).toFixed(0)}%
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={a.status === 'verified' ? 'success' : a.status === 'rejected' ? 'danger' : 'default'} size="sm">
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="primary" size="sm">{a.camera_id}</Badge>
                      </td>
                      <td className="px-5 py-3 text-content-tertiary text-xs whitespace-nowrap">
                        {formatBangkokDateTime(a.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Image Preview Modal */}
      <Modal open={!!previewImg} onClose={() => setPreviewImg(null)} title="Plate Crop" size="lg">
        {previewImg && (
          <img
            src={previewImg}
            alt="Full size plate crop"
            className="w-full rounded-lg"
            crossOrigin="anonymous"
          />
        )}
      </Modal>
    </div>
  )
}
