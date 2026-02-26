import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Button, Input, Spinner } from '../components/UIComponents.jsx'
import { listWatchlist, addToWatchlist, updateWatchlistEntry, deleteWatchlistEntry, listAlerts, acknowledgeAlert } from '../lib/management-api.js'

/* ===== ADD/EDIT WATCHLIST MODAL ===== */
function WatchlistModal({ entry, onClose, onSave }) {
  const [formData, setFormData] = useState({
    plate_text_norm: '',
    display_text: '',
    list_type: 'BLACKLIST',
    alert_level: 'HIGH',
    reason: '',
    expires_at: ''
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
        expires_at: entry.expires_at ? entry.expires_at.split('T')[0] : ''
      })
    }
  }, [entry])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const payload = {
        ...formData,
        expires_at: formData.expires_at || null
      }

      if (entry) {
        await updateWatchlistEntry(entry.id, payload)
      } else {
        await addToWatchlist(payload)
      }

      onSave()
      onClose()
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-100">
              {entry ? 'Edit Watchlist Entry' : 'Add to Watchlist'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Plate Number */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                License Plate Number *
              </label>
              <Input
                value={formData.display_text}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase()
                  setFormData({
                    ...formData,
                    display_text: value,
                    plate_text_norm: value.replace(/\s+/g, '')
                  })
                }}
                placeholder="1กก 1234"
                required
                disabled={!!entry}
                className="w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Normalized: {formData.plate_text_norm || '-'}
              </p>
            </div>

            {/* List Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                List Type *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, list_type: 'BLACKLIST' })}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.list_type === 'BLACKLIST'
                      ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                      : 'border-slate-600 bg-slate-700/30 text-slate-400'
                  }`}
                >
                  <div className="font-semibold">Blacklist</div>
                  <div className="text-xs mt-1">Alert on detection</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, list_type: 'WHITELIST' })}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.list_type === 'WHITELIST'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-600 bg-slate-700/30 text-slate-400'
                  }`}
                >
                  <div className="font-semibold">Whitelist</div>
                  <div className="text-xs mt-1">Approved vehicle</div>
                </button>
              </div>
            </div>

            {/* Alert Level */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Alert Level *
              </label>
              <div className="grid grid-cols-3 gap-3">
                {['HIGH', 'MEDIUM', 'LOW'].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormData({ ...formData, alert_level: level })}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      formData.alert_level === level
                        ? level === 'HIGH'
                          ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                          : level === 'MEDIUM'
                          ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                          : 'border-blue-500 bg-blue-500/20 text-blue-200'
                        : 'border-slate-600 bg-slate-700/30 text-slate-400'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Reason
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Why is this vehicle on the watchlist?"
                rows={3}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Expiration Date (Optional)
              </label>
              <Input
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                className="w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Leave empty for permanent entry
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !formData.plate_text_norm}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  <>{entry ? 'Update Entry' : 'Add to Watchlist'}</>
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ===== ALERT CARD ===== */
function AlertCard({ alert, onAcknowledge }) {
  const [acknowledging, setAcknowledging] = useState(false)

  const handleAcknowledge = async () => {
    setAcknowledging(true)
    try {
      await acknowledgeAlert(alert.id)
      onAcknowledge()
    } catch (err) {
      alert('Failed to acknowledge: ' + err.message)
    } finally {
      setAcknowledging(false)
    }
  }

  const levelColors = {
    HIGH: 'rose',
    MEDIUM: 'amber',
    LOW: 'blue'
  }
  const color = levelColors[alert.alert_level] || 'default'

  return (
    <Card className={`border-${color}-300/40 bg-${color}-500/10`}>
      <CardBody className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="danger" size="lg">
                {alert.alert_level} ALERT
              </Badge>
              {alert.acknowledged && (
                <Badge variant="success" size="sm">
                  ✓ Acknowledged
                </Badge>
              )}
            </div>

            <div className="text-lg font-bold text-slate-100 mb-2">
              {alert.read?.plate_text || 'Unknown Plate'}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-400 text-xs">Camera</div>
                <div className="text-slate-100">{alert.camera_id || '-'}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Detected</div>
                <div className="text-slate-100">
                  {alert.created_at ? new Date(alert.created_at).toLocaleString('th-TH') : '-'}
                </div>
              </div>
            </div>

            {alert.watchlist?.reason && (
              <div className="mt-3 p-3 bg-slate-900/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Reason</div>
                <div className="text-sm text-slate-200">{alert.watchlist.reason}</div>
              </div>
            )}

            {alert.acknowledged && alert.acknowledged_by && (
              <div className="mt-3 text-xs text-slate-400">
                Acknowledged by {alert.acknowledged_by} on{' '}
                {new Date(alert.acknowledged_at).toLocaleString('th-TH')}
              </div>
            )}
          </div>

          {!alert.acknowledged && (
            <Button
              variant="success"
              size="sm"
              onClick={handleAcknowledge}
              disabled={acknowledging}
            >
              {acknowledging ? <Spinner size="sm" /> : 'Acknowledge'}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

/* ===== MAIN WATCHLIST MANAGEMENT PAGE ===== */
export default function WatchlistManagement() {
  const [watchlist, setWatchlist] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [activeTab, setActiveTab] = useState('watchlist') // 'watchlist' or 'alerts'
  const [filters, setFilters] = useState({
    list_type: '',
    active: true,
    search: ''
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
        listAlerts({ acknowledged: false })
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
      alert('Failed to delete: ' + err.message)
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

  const handleModalSave = () => {
    loadData()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-rose-600/20 via-rose-500/10 to-orange-500/10">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Watchlist Management</h1>
              <p className="text-sm text-slate-300 mt-1">
                Manage blacklist and whitelist entries with automatic alerts
              </p>
            </div>
            <Button variant="primary" onClick={handleAddNew}>
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Entry
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`px-6 py-3 rounded-lg font-semibold transition-all ${
            activeTab === 'watchlist'
              ? 'bg-blue-500/20 text-blue-200 border-2 border-blue-500'
              : 'bg-slate-800 text-slate-400 border-2 border-slate-700 hover:border-slate-600'
          }`}
        >
          Watchlist ({watchlist.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-6 py-3 rounded-lg font-semibold transition-all ${
            activeTab === 'alerts'
              ? 'bg-rose-500/20 text-rose-200 border-2 border-rose-500'
              : 'bg-slate-800 text-slate-400 border-2 border-slate-700 hover:border-slate-600'
          }`}
        >
          Active Alerts ({alerts.length})
          {alerts.length > 0 && (
            <span className="ml-2 inline-flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
          )}
        </button>
      </div>

      {error && (
        <Card className="bg-rose-500/10 border-rose-300/40">
          <CardBody>
            <p className="text-rose-200">{error}</p>
          </CardBody>
        </Card>
      )}

      {/* Watchlist Tab */}
      {activeTab === 'watchlist' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">
                Watchlist Entries
              </h2>
              <div className="flex gap-2">
                <select
                  value={filters.list_type}
                  onChange={(e) => setFilters({ ...filters, list_type: e.target.value })}
                  className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-100 text-sm"
                >
                  <option value="">All Types</option>
                  <option value="BLACKLIST">Blacklist</option>
                  <option value="WHITELIST">Whitelist</option>
                </select>
                <Input
                  placeholder="Search plates..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" className="text-blue-500" />
                <span className="ml-3 text-slate-300">Loading...</span>
              </div>
            ) : watchlist.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No watchlist entries found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Plate</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Alert Level</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Reason</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Expires</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {watchlist.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-100">{entry.display_text}</div>
                          <div className="text-xs text-slate-400">{entry.plate_text_norm}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={entry.list_type === 'BLACKLIST' ? 'danger' : 'success'}>
                            {entry.list_type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={
                            entry.alert_level === 'HIGH' ? 'danger' :
                            entry.alert_level === 'MEDIUM' ? 'warning' : 'default'
                          }>
                            {entry.alert_level}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 max-w-xs truncate">
                          {entry.reason || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300">
                          {entry.expires_at ? new Date(entry.expires_at).toLocaleDateString('th-TH') : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={() => handleEdit(entry)}>
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(entry.id)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-rose-500" />
              <span className="ml-3 text-slate-300">Loading alerts...</span>
            </div>
          ) : alerts.length === 0 ? (
            <Card>
              <CardBody>
                <div className="text-center py-12 text-slate-400">
                  No active alerts
                </div>
              </CardBody>
            </Card>
          ) : (
            alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onAcknowledge={loadData} />
            ))
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <WatchlistModal
          entry={editingEntry}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  )
}