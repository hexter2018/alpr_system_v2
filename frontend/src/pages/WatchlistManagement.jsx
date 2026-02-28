import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Button, Input, Select, Spinner, Modal, PageHeader, EmptyState, DataTable } from '../components/UIComponents.jsx'
import { listWatchlist, addToWatchlist, updateWatchlistEntry, deleteWatchlistEntry, listAlerts, acknowledgeAlert } from '../lib/management-api.js'
import { Plus, Shield, ShieldAlert, ShieldCheck, AlertTriangle, Search, Check, Edit2, Trash2, Clock, Bell } from 'lucide-react'

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
    <Modal
      open={true}
      onClose={onClose}
      title={entry ? 'Edit Watchlist Entry' : 'Add to Watchlist'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Plate Number */}
        <Input
          label="License Plate Number *"
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
          hint={`Normalized: ${formData.plate_text_norm || '-'}`}
        />

        {/* List Type */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-2">
            List Type *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, list_type: 'BLACKLIST' })}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                formData.list_type === 'BLACKLIST'
                  ? 'border-danger bg-danger-muted text-danger-content'
                  : 'border-border bg-surface text-content-secondary hover:border-border'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
              <div className="text-left">
                <div className="font-semibold text-sm">Blacklist</div>
                <div className="text-xs opacity-80">Alert on detection</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, list_type: 'WHITELIST' })}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                formData.list_type === 'WHITELIST'
                  ? 'border-success bg-success-muted text-success-content'
                  : 'border-border bg-surface text-content-secondary hover:border-border'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
              <div className="text-left">
                <div className="font-semibold text-sm">Whitelist</div>
                <div className="text-xs opacity-80">Approved vehicle</div>
              </div>
            </button>
          </div>
        </div>

        {/* Alert Level */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-2">
            Alert Level *
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { level: 'HIGH', color: 'danger' },
              { level: 'MEDIUM', color: 'warning' },
              { level: 'LOW', color: 'primary' }
            ].map(({ level, color }) => (
              <button
                key={level}
                type="button"
                onClick={() => setFormData({ ...formData, alert_level: level })}
                className={`px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                  formData.alert_level === level
                    ? `border-${color === 'danger' ? 'danger' : color === 'warning' ? 'warning' : 'accent'} bg-${color === 'danger' ? 'danger-muted' : color === 'warning' ? 'warning-muted' : 'accent-muted'} text-${color === 'danger' ? 'danger-content' : color === 'warning' ? 'warning-content' : 'accent'}`
                    : 'border-border bg-surface text-content-secondary hover:border-border'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">
            Reason
          </label>
          <textarea
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            placeholder="Why is this vehicle on the watchlist?"
            rows={3}
            className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-colors"
          />
        </div>

        {/* Expiration Date */}
        <Input
          label="Expiration Date (Optional)"
          type="date"
          value={formData.expires_at}
          onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
          hint="Leave empty for permanent entry"
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !formData.plate_text_norm}
            className="flex-1"
            loading={saving}
          >
            {entry ? 'Update Entry' : 'Add to Watchlist'}
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
    </Modal>
  )
}

/* ===== ALERT CARD ===== */
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

  return (
    <Card className="border-danger/30 bg-danger-muted">
      <CardBody className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="danger" size="lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {alertData.alert_level} ALERT
              </Badge>
              {alertData.acknowledged && (
                <Badge variant="success" size="sm">
                  <Check className="w-3 h-3" /> Acknowledged
                </Badge>
              )}
            </div>

            <div className="text-lg font-bold text-content font-mono mb-3">
              {alertData.read?.plate_text || 'Unknown Plate'}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-content-tertiary text-xs mb-0.5">Camera</div>
                <div className="text-content font-medium">{alertData.camera_id || '-'}</div>
              </div>
              <div>
                <div className="text-content-tertiary text-xs mb-0.5">Detected</div>
                <div className="text-content font-medium">
                  {alertData.created_at ? new Date(alertData.created_at).toLocaleString('th-TH') : '-'}
                </div>
              </div>
            </div>

            {alertData.watchlist?.reason && (
              <div className="mt-3 p-3 bg-surface rounded-xl border border-border">
                <div className="text-xs text-content-tertiary mb-1">Reason</div>
                <div className="text-sm text-content">{alertData.watchlist.reason}</div>
              </div>
            )}

            {alertData.acknowledged && alertData.acknowledged_by && (
              <div className="mt-3 text-xs text-content-tertiary flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Acknowledged by {alertData.acknowledged_by} on{' '}
                {new Date(alertData.acknowledged_at).toLocaleString('th-TH')}
              </div>
            )}
          </div>

          {!alertData.acknowledged && (
            <Button
              variant="success"
              size="sm"
              onClick={handleAcknowledge}
              loading={acknowledging}
            >
              <Check className="w-4 h-4" />
              Acknowledge
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
  const [activeTab, setActiveTab] = useState('watchlist')
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

  const watchlistColumns = [
    {
      key: 'display_text',
      label: 'Plate',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-content font-mono">{row.display_text}</div>
          <div className="text-xs text-content-tertiary font-mono">{row.plate_text_norm}</div>
        </div>
      )
    },
    {
      key: 'list_type',
      label: 'Type',
      render: (val) => (
        <Badge variant={val === 'BLACKLIST' ? 'danger' : 'success'}>
          {val === 'BLACKLIST' ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
          {val}
        </Badge>
      )
    },
    {
      key: 'alert_level',
      label: 'Alert Level',
      render: (val) => (
        <Badge variant={val === 'HIGH' ? 'danger' : val === 'MEDIUM' ? 'warning' : 'default'}>
          {val}
        </Badge>
      )
    },
    {
      key: 'reason',
      label: 'Reason',
      cellClassName: 'max-w-xs truncate text-content-secondary text-sm',
      render: (val) => val || '-'
    },
    {
      key: 'expires_at',
      label: 'Expires',
      render: (val) => (
        <span className="text-sm text-content-secondary">
          {val ? new Date(val).toLocaleDateString('th-TH') : 'Never'}
        </span>
      )
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      cellClassName: 'text-right',
      render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={() => handleEdit(row)}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="xs" onClick={() => handleDelete(row.id)}>
            <Trash2 className="w-3.5 h-3.5 text-danger" />
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist Management"
        description="Manage blacklist and whitelist entries with automatic alerts"
        actions={
          <Button variant="primary" onClick={handleAddNew} icon={<Plus className="w-4 h-4" />}>
            Add Entry
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'watchlist'
              ? 'bg-accent-muted text-accent border border-accent/30'
              : 'bg-surface-raised text-content-secondary border border-border hover:border-accent/20'
          }`}
        >
          <Shield className="w-4 h-4" />
          Watchlist ({watchlist.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'alerts'
              ? 'bg-danger-muted text-danger-content border border-danger/30'
              : 'bg-surface-raised text-content-secondary border border-border hover:border-danger/20'
          }`}
        >
          <Bell className="w-4 h-4" />
          Active Alerts ({alerts.length})
          {alerts.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
            </span>
          )}
        </button>
      </div>

      {error && (
        <Card className="border-danger/30 bg-danger-muted">
          <CardBody>
            <div className="flex items-center gap-2 text-danger-content">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-sm">{error}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Watchlist Tab */}
      {activeTab === 'watchlist' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-content">Watchlist Entries</h2>
              <div className="flex gap-2">
                <Select
                  value={filters.list_type}
                  onChange={(e) => setFilters({ ...filters, list_type: e.target.value })}
                  className="w-36"
                >
                  <option value="">All Types</option>
                  <option value="BLACKLIST">Blacklist</option>
                  <option value="WHITELIST">Whitelist</option>
                </Select>
                <Input
                  placeholder="Search plates..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  icon={<Search className="w-4 h-4" />}
                  className="w-56"
                />
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Spinner size="lg" />
                <span className="text-content-secondary">Loading...</span>
              </div>
            ) : (
              <DataTable
                columns={watchlistColumns}
                data={watchlist}
                emptyMessage="No watchlist entries found"
              />
            )}
          </CardBody>
        </Card>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Spinner size="lg" />
              <span className="text-content-secondary">Loading alerts...</span>
            </div>
          ) : alerts.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Bell className="w-8 h-8" />}
                  title="No active alerts"
                  description="All alerts have been acknowledged. Great job!"
                />
              </CardBody>
            </Card>
          ) : (
            alerts.map(alertItem => (
              <AlertCard key={alertItem.id} alert={alertItem} onAcknowledge={loadData} />
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
