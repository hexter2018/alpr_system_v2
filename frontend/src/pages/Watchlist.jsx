import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = '/api'

const LEVEL_BADGE = {
  LOW:      'bg-blue-100 text-blue-800',
  MEDIUM:   'bg-yellow-100 text-yellow-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

const TYPE_BADGE = {
  BLACKLIST: 'bg-red-100 text-red-700',
  WHITELIST: 'bg-green-100 text-green-700',
  VIP:       'bg-purple-100 text-purple-700',
}

const TYPE_LABEL = {
  BLACKLIST: '🚫 Blacklist',
  WHITELIST: '✅ Whitelist',
  VIP:       '⭐ VIP',
}

function Badge({ text, cls }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {text}
    </span>
  )
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function WatchlistModal({ entry, onClose, onSave }) {
  const [form, setForm] = useState({
    plate_text_norm: entry?.plate_text_norm ?? '',
    province:        entry?.province ?? '',
    list_type:       entry?.list_type ?? 'BLACKLIST',
    alert_level:     entry?.alert_level ?? 'MEDIUM',
    reason:          entry?.reason ?? '',
    expires_at:      entry?.expires_at?.slice(0, 16) ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        plate_text_norm: form.plate_text_norm.toUpperCase().replace(/\s/g, ''),
        province:  form.province  || null,
        reason:    form.reason    || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      }
      if (entry?.id) {
        await axios.put(`${API}/watchlist/${entry.id}`, {
          reason: payload.reason,
          alert_level: payload.alert_level,
          expires_at: payload.expires_at,
        })
      } else {
        await axios.post(`${API}/watchlist/`, payload)
      }
      onSave()
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">
          {entry?.id ? 'Edit Watchlist Entry' : 'Add to Watchlist'}
        </h2>
        {error && <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Plate Number *</span>
            <input
              required
              disabled={!!entry?.id}
              className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              value={form.plate_text_norm}
              onChange={e => set('plate_text_norm', e.target.value)}
              placeholder="e.g. กข1234"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Province</span>
            <input
              className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm"
              value={form.province}
              onChange={e => set('province', e.target.value)}
              placeholder="Optional — leave blank to match any province"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Category</span>
              <select
                disabled={!!entry?.id}
                className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                value={form.list_type}
                onChange={e => set('list_type', e.target.value)}
              >
                <option value="BLACKLIST">🚫 Blacklist</option>
                <option value="WHITELIST">✅ Whitelist</option>
                <option value="VIP">⭐ VIP</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Alert Level</span>
              <select
                className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm"
                value={form.alert_level}
                onChange={e => set('alert_level', e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason / Note</span>
            <textarea
              className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="Optional description"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Expires At</span>
            <input
              type="datetime-local"
              className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm"
              value={form.expires_at}
              onChange={e => set('expires_at', e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Watchlist() {
  const [entries, setEntries]       = useState([])
  const [alerts, setAlerts]         = useState([])
  const [filterType, setFilterType] = useState('ALL')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [modal, setModal]           = useState(null)   // null | 'add' | {entry}
  const [tab, setTab]               = useState('watchlist')  // 'watchlist' | 'alerts'

  const fetchWatchlist = useCallback(async () => {
    setLoading(true)
    try {
      const params = { active_only: false, limit: 200 }
      if (filterType !== 'ALL') params.list_type = filterType
      if (search)               params.q         = search
      const { data } = await axios.get(`${API}/watchlist/`, { params })
      setEntries(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filterType, search])

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/watchlist/alerts/recent`, {
        params: { limit: 50 },
      })
      setAlerts(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])
  useEffect(() => { if (tab === 'alerts') fetchAlerts() }, [tab, fetchAlerts])

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this entry?')) return
    await axios.delete(`${API}/watchlist/${id}`)
    fetchWatchlist()
  }

  const handleAcknowledge = async (alertId) => {
    await axios.post(`${API}/watchlist/alerts/${alertId}/acknowledge`)
    fetchAlerts()
  }

  const onSave = () => { setModal(null); fetchWatchlist() }

  const unackCount = alerts.filter(a => !a.acknowledged).length

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Watchlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage blacklisted, whitelisted, and VIP plates for real-time alerting
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          + Add Entry
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {['watchlist', 'alerts'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'alerts'
              ? `Alerts${unackCount > 0 ? ` (${unackCount})` : ''}`
              : 'Watchlist'}
          </button>
        ))}
      </div>

      {tab === 'watchlist' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex gap-1">
              {['ALL', 'BLACKLIST', 'WHITELIST', 'VIP'].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterType === t
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {t === 'ALL' ? 'All' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <input
              className="border rounded-lg px-3 py-1.5 text-sm w-52"
              placeholder="Search plate / reason…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchWatchlist()}
            />
            <button
              onClick={fetchWatchlist}
              className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
            >
              Search
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Plate', 'Province', 'Category', 'Alert Level', 'Reason', 'Expires', 'Active', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                )}
                {!loading && entries.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No entries found. Add a plate to get started.
                  </td></tr>
                )}
                {entries.map(e => (
                  <tr key={e.id} className={`hover:bg-gray-50 ${!e.active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 font-mono font-semibold">{e.plate_text_norm}</td>
                    <td className="px-4 py-3 text-gray-500">{e.province || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge text={TYPE_LABEL[e.list_type] ?? e.list_type}
                             cls={TYPE_BADGE[e.list_type] ?? 'bg-gray-100 text-gray-700'} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge text={e.alert_level}
                             cls={LEVEL_BADGE[e.alert_level] ?? 'bg-gray-100 text-gray-700'} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{e.reason || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {e.expires_at ? new Date(e.expires_at).toLocaleDateString('th-TH') : '∞'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${e.active ? 'text-green-600' : 'text-gray-400'}`}>
                        {e.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(e)}
                          className="text-xs text-blue-600 hover:underline">Edit</button>
                        {e.active && (
                          <button onClick={() => handleDelete(e.id)}
                            className="text-xs text-red-500 hover:underline">Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'alerts' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Time', 'Plate', 'Province', 'Camera', 'Category', 'Level', 'Telegram', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No alerts yet</td></tr>
              )}
              {alerts.map(a => (
                <tr key={a.id} className={a.acknowledged ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString('th-TH')}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">{a.plate_text_norm}</td>
                  <td className="px-4 py-3 text-gray-500">{a.province || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.camera_id || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge text={TYPE_LABEL[a.list_type] ?? a.list_type}
                           cls={TYPE_BADGE[a.list_type] ?? 'bg-gray-100 text-gray-700'} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge text={a.alert_level}
                           cls={LEVEL_BADGE[a.alert_level] ?? 'bg-gray-100 text-gray-700'} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {a.telegram_sent ? '✅' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {a.acknowledged
                      ? <span className="text-xs text-gray-400">✓ {a.acknowledged_by || 'done'}</span>
                      : <span className="text-xs text-orange-600 font-medium">Pending</span>}
                  </td>
                  <td className="px-4 py-3">
                    {!a.acknowledged && (
                      <button
                        onClick={() => handleAcknowledge(a.id)}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <WatchlistModal
          entry={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={onSave}
        />
      )}
    </div>
  )
}
