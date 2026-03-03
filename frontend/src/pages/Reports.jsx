import React, { useState, useEffect } from 'react'
import { absImageUrl, API_BASE } from '../lib/api.js'
import { useTheme } from '../lib/ThemeContext.jsx'
import {
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Button,
  Badge,
  Spinner,
} from '../components/UIComponents.jsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from 'recharts'
import { Download, Search, X } from 'lucide-react'

function formatBangkokDateTime(value) {
  if (!value) return '-'
  const raw = String(value)
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
}

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
      <p className="text-slate-500 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' && entry.value % 1 !== 0 ? entry.value.toFixed(1) + '%' : entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function Reports() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [province, setProvince] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [accuracy, setAccuracy] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

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

      const res = await fetch(`${API_BASE}/api/reports/stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)

      const actRes = await fetch(
        `${API_BASE}/api/reports/activity?${params}&limit=50`
      )
      if (actRes.ok) {
        const actData = await actRes.json()
        setActivity(actData)
      }

      const accRes = await fetch(`${API_BASE}/api/reports/accuracy?days=7`)
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

  function clearFilters() {
    setProvince('')
    setCameraId('')
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }

  /* ── Chart data ── */
  const confidenceData = stats
    ? [
        { name: 'High (>=90%)', value: stats.high_confidence, fill: '#3b82f6' },
        { name: 'Med (70-90%)', value: stats.medium_confidence, fill: '#f59e0b' },
        { name: 'Low (<70%)', value: stats.low_confidence, fill: '#ef4444' },
      ]
    : []

  const accuracyChartData = accuracy.map((row) => ({
    date: row.date,
    accuracy: row.accuracy,
    alpr: row.alpr,
    mlpr: row.mlpr,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Historical statistics and detection activity logs
        </p>
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>Filters</h2>
            {(province || cameraId) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-400">
              Start Date
              <input
                type="date"
                className="input-dark mt-1"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-400">
              End Date
              <input
                type="date"
                className="input-dark mt-1"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-400">
              Province
              <input
                type="text"
                placeholder="All provinces"
                className="input-dark mt-1"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-400">
              Camera ID
              <input
                type="text"
                placeholder="All cameras"
                className="input-dark mt-1"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
              icon={
                loading ? (
                  <Spinner size="sm" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )
              }
            >
              {loading ? 'Loading...' : 'Search'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCSV}
              disabled={!stats}
              icon={<Download className="h-3.5 w-3.5" />}
            >
              Export CSV
            </Button>
          </div>
        </CardBody>
      </Card>

      {stats && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Reads"
              value={stats.total_reads?.toLocaleString()}
              accentColor="blue"
            />
            <StatCard
              title="Verified"
              value={stats.verified_reads?.toLocaleString()}
              accentColor="emerald"
            />
            <StatCard
              title="ALPR Correct"
              value={stats.alpr_total?.toLocaleString()}
              accentColor="blue"
            />
            <StatCard
              title="MLPR Corrected"
              value={stats.mlpr_total?.toLocaleString()}
              accentColor="red"
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Confidence Distribution */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Confidence Distribution
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Accuracy: {stats.accuracy?.toFixed(1)}%
                    </p>
                  </div>
                  <Badge
                    variant={
                      stats.accuracy >= 90
                        ? 'success'
                        : stats.accuracy >= 75
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {stats.accuracy?.toFixed(1)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={confidenceData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      />
                      <Bar
                        dataKey="value"
                        name="Count"
                        radius={[4, 4, 0, 0]}
                        barSize={48}
                      >
                        {confidenceData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            {/* Top Provinces */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">
                  Top Provinces
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Top 10 detected</p>
              </CardHeader>
              <CardBody>
                <div className="space-y-2.5 max-h-52 overflow-y-auto">
                  {stats.top_provinces?.map((p, i) => {
                    const maxCount = stats.top_provinces[0]?.count || 1
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-5 tabular-nums text-right">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-300 truncate">
                              {p.province || 'Unknown'}
                            </span>
                            <span className="text-sm font-medium text-white tabular-nums">
                              {p.count?.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{
                                width: `${(p.count / maxCount) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Accuracy Trend Chart */}
          {accuracy.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">
                  Daily Accuracy Trend
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Last {accuracy.length} days
                </p>
              </CardHeader>
              <CardBody>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={accuracyChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        name="Accuracy"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3 }}
                        activeDot={{ r: 5, fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Accuracy table below */}
                <div className="mt-4 border-t border-white/[0.06] pt-4 overflow-x-auto">
                  <table className="table-enterprise">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-right">ALPR</th>
                        <th className="text-right">MLPR</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accuracy.map((row, i) => (
                        <tr key={i}>
                          <td className="text-white">{row.date}</td>
                          <td className="text-right text-blue-400">
                            {row.alpr}
                          </td>
                          <td className="text-right text-red-400">
                            {row.mlpr}
                          </td>
                          <td className="text-right text-white">
                            {row.total}
                          </td>
                          <td className="text-right font-medium text-white">
                            {row.accuracy?.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Activity Log Table */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-white">
                Activity Log
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest 50 records
              </p>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th>Crop</th>
                      <th>Plate</th>
                      <th>Province</th>
                      <th>Confidence</th>
                      <th>Status</th>
                      <th>Camera</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <img
                            src={absImageUrl(a.crop_url)}
                            alt="crop"
                            className="h-8 w-14 rounded border border-white/[0.06] object-cover"
                          />
                        </td>
                        <td className="font-mono text-white">
                          {a.plate_text || '-'}
                        </td>
                        <td>{a.province || '-'}</td>
                        <td>
                          <Badge
                            variant={
                              a.confidence >= 0.9
                                ? 'success'
                                : a.confidence >= 0.7
                                  ? 'warning'
                                  : 'danger'
                            }
                            size="sm"
                          >
                            {(a.confidence * 100).toFixed(0)}%
                          </Badge>
                        </td>
                        <td>
                          <Badge variant="default" size="sm">
                            {a.status}
                          </Badge>
                        </td>
                        <td className="text-slate-500 text-xs">
                          {a.camera_id}
                        </td>
                        <td className="text-slate-500 text-xs tabular-nums">
                          {formatBangkokDateTime(a.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
