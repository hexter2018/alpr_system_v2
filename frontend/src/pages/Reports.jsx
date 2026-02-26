import React, { useState, useEffect } from 'react'
import { absImageUrl, API_BASE } from '../lib/api.js'
import {
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Filter,
  Loader2,
  MapPin,
  Search,
  Shield,
  TrendingUp,
  XCircle,
} from 'lucide-react'

/* ================================================================
   FORMAT BANGKOK DATETIME
   ================================================================ */
function formatBangkokDateTime(value) {
  if (!value) return '-'
  const raw = String(value)
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
}

/* ================================================================
   GLASS CARD  (matches Dashboard)
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
   ANIMATED NUMBER
   ================================================================ */
function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0)
  const numericValue = typeof value === 'number' ? value : parseInt(String(value).replace(/,/g, ''), 10) || 0

  useEffect(() => {
    if (numericValue === 0) { setDisplay(0); return }
    let start = 0
    const step = numericValue / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= numericValue) { setDisplay(numericValue); clearInterval(timer) }
      else setDisplay(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [numericValue, duration])

  return <>{display.toLocaleString()}</>
}

/* ================================================================
   STAT CARD  (glassmorphism)
   ================================================================ */
function StatCard({ icon: Icon, title, value, color = 'emerald' }) {
  const colorMap = {
    emerald: { icon: 'text-emerald-400', value: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.06)]' },
    rose:    { icon: 'text-rose-400',    value: 'text-rose-400',    glow: 'shadow-[0_0_20px_rgba(244,63,94,0.06)]' },
    cyan:    { icon: 'text-cyan-400',    value: 'text-cyan-400',    glow: '' },
    white:   { icon: 'text-slate-300',   value: 'text-white',       glow: '' },
  }
  const c = colorMap[color] || colorMap.white

  return (
    <GlassCard className={`p-5 ${c.glow}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className={`text-3xl font-bold tracking-tight ${c.value}`}>
        <AnimatedNumber value={value} />
      </div>
    </GlassCard>
  )
}

/* ================================================================
   CONFIDENCE BAR
   ================================================================ */
function ConfidenceBar({ label, value, total, color, textColor }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>
          {value}
          <span className="text-slate-500 font-normal ml-1 text-xs">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ================================================================
   MAIN REPORTS PAGE
   ================================================================ */
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

      const actRes = await fetch(`${API_BASE}/api/reports/activity?${params}&limit=50`)
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

  /* ---------- RENDER ---------- */
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileText className="h-6 w-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Historical Reports</h1>
          </div>
          <p className="text-sm text-slate-400 pl-9">
            View ALPR detection statistics and activity logs by time range
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!stats}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200 text-sm font-medium self-start sm:self-auto
            ${stats
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/40'
              : 'border-white/[0.06] bg-white/[0.02] text-slate-500 cursor-not-allowed'
            }
          `}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* ERROR */}
      {err && (
        <GlassCard className="p-4 border-rose-500/20" hover={false}>
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-rose-300 mb-0.5">Request Error</h3>
              <p className="text-xs text-rose-200/70 leading-relaxed">{err}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* FILTERS */}
      <GlassCard className="p-5" hover={false}>
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Filters</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Start Date
            </span>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30
                         transition-all duration-200"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> End Date
            </span>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30
                         transition-all duration-200"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Province
            </span>
            <input
              type="text"
              placeholder="e.g. Bangkok"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30
                         transition-all duration-200"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Camera className="h-3 w-3" /> Camera ID
            </span>
            <input
              type="text"
              placeholder="e.g. plaza2-lane1"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30
                         transition-all duration-200"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25
                       text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/40
                       transition-all duration-200 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </GlassCard>

      {/* LOADING STATE */}
      {loading && !stats && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
            <p className="text-sm text-slate-400 tracking-wide">Fetching report data...</p>
          </div>
        </div>
      )}

      {/* STATS + CONTENT */}
      {stats && (
        <>
          {/* KPI ROW */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={BarChart3} title="Total Reads" value={stats.total_reads} color="white" />
            <StatCard icon={CheckCircle2} title="Verified" value={stats.verified_reads} color="cyan" />
            <StatCard icon={TrendingUp} title="ALPR Correct" value={stats.alpr_total} color="emerald" />
            <StatCard icon={Shield} title="MLPR Corrected" value={stats.mlpr_total} color="rose" />
          </div>

          {/* ACCURACY + TOP PROVINCES */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Accuracy Panel */}
            <GlassCard className="lg:col-span-7 p-6" hover={false}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">
                    Accuracy: {stats.accuracy.toFixed(1)}%
                  </h2>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    stats.accuracy >= 90
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : stats.accuracy >= 75
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {stats.accuracy >= 90 ? 'Excellent' : stats.accuracy >= 75 ? 'Good' : 'Needs Improvement'}
                </span>
              </div>
              <div className="space-y-4">
                <ConfidenceBar
                  label="High Confidence (>=90%)"
                  value={stats.high_confidence}
                  total={Math.max(stats.total_reads, 1)}
                  color="bg-emerald-500"
                  textColor="text-emerald-400"
                />
                <ConfidenceBar
                  label="Medium Confidence (70-90%)"
                  value={stats.medium_confidence}
                  total={Math.max(stats.total_reads, 1)}
                  color="bg-amber-500"
                  textColor="text-amber-400"
                />
                <ConfidenceBar
                  label="Low Confidence (<70%)"
                  value={stats.low_confidence}
                  total={Math.max(stats.total_reads, 1)}
                  color="bg-rose-500"
                  textColor="text-rose-400"
                />
              </div>
            </GlassCard>

            {/* Top Provinces */}
            <GlassCard className="lg:col-span-5 p-6" hover={false}>
              <div className="flex items-center gap-2 mb-5">
                <MapPin className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Top 10 Provinces</h2>
              </div>
              <div className="space-y-2.5">
                {stats.top_provinces.map((p, i) => {
                  const maxCount = stats.top_provinces[0]?.count || 1
                  const barPct = (p.count / maxCount) * 100
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{p.province || 'Unknown'}</span>
                        <span className="font-semibold text-white">{p.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </GlassCard>
          </div>

          {/* DAILY ACCURACY TABLE */}
          {accuracy.length > 0 && (
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Daily Accuracy Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">ALPR</th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">MLPR</th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {accuracy.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 text-slate-200 font-medium">{row.date}</td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-semibold">{row.alpr}</td>
                        <td className="py-3 px-4 text-right text-rose-400 font-semibold">{row.mlpr}</td>
                        <td className="py-3 px-4 text-right text-white">{row.total}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.accuracy >= 90
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : row.accuracy >= 75
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {row.accuracy.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* ACTIVITY LOG */}
          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center gap-2 mb-5">
              <Search className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Activity Log</h2>
              <span className="text-xs text-slate-500 ml-1">(latest 50)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Crop</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Plate</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Province</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Conf.</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Camera</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {activity.map((a) => (
                    <tr key={a.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-2.5 px-3">
                        <img
                          src={absImageUrl(a.crop_url)}
                          alt="crop"
                          crossOrigin="anonymous"
                          className="h-10 w-16 rounded-lg border border-white/[0.08] object-cover"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-white font-medium">{a.plate_text || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-300">{a.province || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            a.confidence >= 0.9
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : a.confidence >= 0.7
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {(a.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-xs text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded-lg">{a.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-xs">{a.camera_id}</td>
                      <td className="py-2.5 px-3 text-slate-500 text-xs">{formatBangkokDateTime(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  )
}
