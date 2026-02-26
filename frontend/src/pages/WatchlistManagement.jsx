import React, { useState, useEffect } from 'react'
import {
  listWatchlist,
  addToWatchlist,
  updateWatchlistEntry,
  deleteWatchlistEntry,
  listAlerts,
  acknowledgeAlert,
} from '../lib/management-api.js'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  Filter,
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

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
   LIVE PULSE INDICATOR
   ================================================================ */
function LivePulse({ color = 'emerald' }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 bg-${color}-500`} />
    </span>
  )
}

/* ================================================================
   BADGE
   ================================================================ */
function GlassBadge({ children, variant = 'default', size = 'sm' }) {
  const variants = {
    default:  'bg-white/[0.06] text-slate-300 border-white/[0.08]',
    danger:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
    warning:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    success:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    info:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }
  const sizes = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-xs px-3 py-1.5',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  )
}

/* ================================================================
   ADD/EDIT WATCHLIST MODAL (glassmorphism)
   ================================================================ */
function WatchlistModal({ entry, onClose, onSave }) {
  const [formData, setFormData] = useState({
    plate_text_norm: '',
    display_text: '',
    list_type: 'BLACKLIST',
    alert_level: 'HIGH',
    reason: '',
    expires_at: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (entry) {
      setFormData({
        plate_text_norm: entry.plate_text_norm || '',
        display_text: entry.display_text || '',
        list_type: entry.list_type || 'BLACKLIST',
        alert_level: entry.alert_level || 'HIGH',
        reason: entry.reason || '',
        expires_at: entry.expires_at ? entry.expires_at.split('T')[0] : '',
      })
    }
  }, [entry])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...formData, expires_at: formData.expires_at || null }
      if (entry) await updateWatchlistEntry(entry.id, payload)
      else await addToWatchlist(payload)
      onSave()
      onClose()
    } catch (err) {
      window.alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputClasses =
    'w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all duration-200'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0b] border border-white/[0.08] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          {/* Modal Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                {entry ? <Edit3 className="h-4 w-4 text-emerald-400" /> : <Plus className="h-4 w-4 text-emerald-400" />}
              </div>
              <h2 className="text-lg font-bold text-white">
                {entry ? 'Edit Watchlist Entry' : 'Add to Watchlist'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08]
                         text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Plate Number */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                License Plate Number *
              </label>
              <input
                value={formData.display_text}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase()
                  setFormData({ ...formData, display_text: value, plate_text_norm: value.replace(/\s+/g, '') })
                }}
                placeholder="1กก 1234"
                required
                disabled={!!entry}
                className={`${inputClasses} ${entry ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <p className="text-[10px] text-slate-500">
                Normalized: <span className="text-slate-400 font-mono">{formData.plate_text_norm || '-'}</span>
              </p>
            </div>

            {/* List Type */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">List Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'BLACKLIST', label: 'Blacklist', sub: 'Alert on detection', Icon: ShieldAlert, color: 'rose' },
                  { value: 'WHITELIST', label: 'Whitelist', sub: 'Approved vehicle', Icon: ShieldCheck, color: 'emerald' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, list_type: opt.value })}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left ${
                      formData.list_type === opt.value
                        ? `border-${opt.color}-500/40 bg-${opt.color}-500/10 text-${opt.color}-300`
                        : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.12]'
                    }`}
                  >
                    <opt.Icon className={`h-5 w-5 ${formData.list_type === opt.value ? `text-${opt.color}-400` : 'text-slate-500'}`} />
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-[10px] opacity-70">{opt.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Alert Level */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Alert Level *</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'HIGH', color: 'rose' },
                  { value: 'MEDIUM', color: 'amber' },
                  { value: 'LOW', color: 'cyan' },
                ].map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, alert_level: lvl.value })}
                    className={`px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                      formData.alert_level === lvl.value
                        ? `border-${lvl.color}-500/40 bg-${lvl.color}-500/10 text-${lvl.color}-300`
                        : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.12]'
                    }`}
                  >
                    {lvl.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Reason</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Why is this vehicle on the watchlist?"
                rows={3}
                className={inputClasses}
              />
            </div>

            {/* Expiration */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Expiration Date</label>
              <input
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                className={inputClasses}
              />
              <p className="text-[10px] text-slate-500">Leave empty for permanent entry</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || !formData.plate_text_norm}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25
                           text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/40
                           transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving...' : entry ? 'Update Entry' : 'Add to Watchlist'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-sm font-medium
                           hover:bg-white/[0.08] transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ALERT CARD (glassmorphism)
   ================================================================ */
function AlertCard({ alert: alertData, onAcknowledge }) {
  const [acknowledging, setAcknowledging] = useState(false)

  const handleAcknowledge = async () => {
    setAcknowledging(true)
    try {
      await acknowledgeAlert(alertData.id)
      onAcknowledge()
    } catch (err) {
      window.alert('Failed to acknowledge: ' + err.message)
    } finally {
      setAcknowledging(false)
    }
  }

  const levelConfig = {
    HIGH:   { border: 'border-rose-500/20', bg: 'shadow-[0_0_20px_rgba(244,63,94,0.06)]', badge: 'danger' },
    MEDIUM: { border: 'border-amber-500/20', bg: '', badge: 'warning' },
    LOW:    { border: 'border-cyan-500/20', bg: '', badge: 'info' },
  }
  const config = levelConfig[alertData.alert_level] || levelConfig.LOW

  return (
    <GlassCard className={`p-5 ${config.border} ${config.bg}`} hover={false}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badge row */}
          <div className="flex items-center gap-2 mb-3">
            <GlassBadge variant={config.badge} size="md">
              <AlertTriangle className="h-3 w-3" />
              {alertData.alert_level} ALERT
            </GlassBadge>
            {alertData.acknowledged && (
              <GlassBadge variant="success" size="sm">
                <CheckCircle2 className="h-3 w-3" />
                Acknowledged
              </GlassBadge>
            )}
          </div>

          {/* Plate */}
          <div className="text-xl font-bold text-white font-mono mb-3 tracking-wide">
            {alertData.read?.plate_text || 'Unknown Plate'}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Camera</div>
              <div className="text-sm text-slate-200">{alertData.camera_id || '-'}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Detected</div>
              <div className="text-sm text-slate-200">
                {alertData.created_at ? new Date(alertData.created_at).toLocaleString('th-TH') : '-'}
              </div>
            </div>
          </div>

          {/* Reason */}
          {alertData.watchlist?.reason && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Reason</div>
              <div className="text-sm text-slate-300">{alertData.watchlist.reason}</div>
            </div>
          )}

          {/* Ack info */}
          {alertData.acknowledged && alertData.acknowledged_by && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
              <CheckCircle2 className="h-3 w-3" />
              Acknowledged by {alertData.acknowledged_by} on {new Date(alertData.acknowledged_at).toLocaleString('th-TH')}
            </div>
          )}
        </div>

        {/* Acknowledge button */}
        {!alertData.acknowledged && (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20
                       text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 hover:border-emerald-500/30
                       transition-all duration-200 disabled:opacity-50 flex-shrink-0"
          >
            {acknowledging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Acknowledge
          </button>
        )}
      </div>
    </GlassCard>
  )
}

/* ================================================================
   MAIN WATCHLIST MANAGEMENT PAGE
   ================================================================ */
export default function WatchlistManagement() {
  const [watchlist, setWatchlist] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [activeTab, setActiveTab] = useState('watchlist')
  const [filters, setFilters] = useState({
    list_type: '',
    active: true,
    search: '',
  })

  useEffect(() => {
    loadData()
  }, [filters])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [watchlistData, alertsData] = await Promise.all([
        listWatchlist(filters),
        listAlerts({ acknowledged: false }),
      ])
      setWatchlist(watchlistData)
      setAlerts(alertsData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this entry?')) return
    try {
      await deleteWatchlistEntry(id)
      loadData()
    } catch (err) {
      window.alert('Failed to delete: ' + err.message)
    }
  }

  const handleEdit = (entry) => {
    setEditingEntry(entry)
    setShowModal(true)
  }

  const handleAddNew = () => {
    setEditingEntry(null)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setEditingEntry(null)
  }

  const handleModalSave = () => loadData()

  const inputClasses =
    'px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all duration-200'

  /* ---------- RENDER ---------- */
  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield className="h-6 w-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Watchlist Management</h1>
          </div>
          <p className="text-sm text-slate-400 pl-9">
            Manage blacklist and whitelist entries with automatic alerts
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25
                     text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/40
                     transition-all duration-200 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Add Entry
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 border ${
            activeTab === 'watchlist'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
              : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:bg-white/[0.06] hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          Watchlist ({watchlist.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 border ${
            activeTab === 'alerts'
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
              : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:bg-white/[0.06] hover:text-slate-200'
          }`}
        >
          <Bell className="h-4 w-4" />
          Active Alerts ({alerts.length})
          {alerts.length > 0 && (
            <span className="relative flex h-2.5 w-2.5 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
          )}
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <GlassCard className="p-4 border-rose-500/20" hover={false}>
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-rose-300 mb-0.5">Error</h3>
              <p className="text-xs text-rose-200/70 leading-relaxed">{error}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ==================== WATCHLIST TAB ==================== */}
      {activeTab === 'watchlist' && (
        <GlassCard className="p-6" hover={false}>
          {/* Filter row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Watchlist Entries</h2>
            </div>
            <div className="flex gap-2">
              <select
                value={filters.list_type}
                onChange={(e) => setFilters({ ...filters, list_type: e.target.value })}
                className={inputClasses}
              >
                <option value="">All Types</option>
                <option value="BLACKLIST">Blacklist</option>
                <option value="WHITELIST">Whitelist</option>
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  placeholder="Search plates..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className={`${inputClasses} pl-9 w-64`}
                />
              </div>
            </div>
          </div>

          {/* Table content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                <p className="text-sm text-slate-400 tracking-wide">Loading...</p>
              </div>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="text-center py-16">
              <Shield className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No watchlist entries found</p>
              <p className="text-xs text-slate-500 mt-1">Add your first entry to start monitoring</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Plate</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Alert Level</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reason</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Expires</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {watchlist.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white font-mono">{entry.display_text}</div>
                        <div className="text-[10px] text-slate-500">{entry.plate_text_norm}</div>
                      </td>
                      <td className="py-3 px-4">
                        <GlassBadge variant={entry.list_type === 'BLACKLIST' ? 'danger' : 'success'} size="md">
                          {entry.list_type === 'BLACKLIST' ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                          {entry.list_type}
                        </GlassBadge>
                      </td>
                      <td className="py-3 px-4">
                        <GlassBadge
                          variant={entry.alert_level === 'HIGH' ? 'danger' : entry.alert_level === 'MEDIUM' ? 'warning' : 'info'}
                          size="sm"
                        >
                          {entry.alert_level}
                        </GlassBadge>
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate text-xs">
                        {entry.reason || <span className="text-slate-600">-</span>}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {entry.expires_at ? (
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {new Date(entry.expires_at).toLocaleDateString('th-TH')}
                          </span>
                        ) : (
                          <span className="text-slate-500">Permanent</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]
                                       text-slate-300 text-xs font-medium hover:bg-white/[0.08] hover:text-white
                                       transition-all duration-200"
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/15
                                       text-rose-400 text-xs font-medium hover:bg-rose-500/15 hover:border-rose-500/25
                                       transition-all duration-200"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {/* ==================== ALERTS TAB ==================== */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-rose-500/30 border-t-rose-500 animate-spin" />
                <p className="text-sm text-slate-400 tracking-wide">Loading alerts...</p>
              </div>
            </div>
          ) : alerts.length === 0 ? (
            <GlassCard className="p-10" hover={false}>
              <div className="text-center">
                <BellOff className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No active alerts</p>
                <p className="text-xs text-slate-500 mt-1">All alerts have been acknowledged</p>
              </div>
            </GlassCard>
          ) : (
            alerts.map((alertItem) => (
              <AlertCard key={alertItem.id} alert={alertItem} onAcknowledge={loadData} />
            ))
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <WatchlistModal entry={editingEntry} onClose={handleModalClose} onSave={handleModalSave} />
      )}
    </div>
  )
}
