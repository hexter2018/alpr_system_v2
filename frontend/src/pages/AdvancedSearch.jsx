import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Button, Input, Select, Spinner, Modal, PageHeader, EmptyState, DataTable } from '../components/UIComponents.jsx'
import { searchPlates, getEvidence } from '../lib/management-api.js'
import { API_BASE } from '../lib/api.js'
import { Search, RotateCcw, Eye, Download, Image, X, ShieldAlert, Clock, Camera, MapPin, Crosshair, Check, AlertTriangle } from 'lucide-react'

/* ===== EVIDENCE VIEWER MODAL ===== */
function EvidenceViewer({ readId, onClose }) {
  const [evidence, setEvidence] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imageView, setImageView] = useState('original')

  useEffect(() => {
    if (readId) {
      loadEvidence()
    }
  }, [readId])

  async function loadEvidence() {
    setLoading(true)
    setError('')
    try {
      const data = await getEvidence(readId)
      setEvidence(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Modal open={true} onClose={onClose} title="Loading Evidence..." size="xl">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" />
          <p className="text-content-secondary">Loading evidence...</p>
        </div>
      </Modal>
    )
  }

  if (error) {
    return (
      <Modal open={true} onClose={onClose} title="Error" size="sm">
        <div className="text-center py-4">
          <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-3" />
          <p className="text-danger-content mb-4">{error}</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={true} onClose={onClose} title={`Evidence: ${evidence?.plate_text || 'Unknown'}`} size="full">
      <div className="space-y-6">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={evidence?.status === 'VERIFIED' ? 'success' : 'warning'} size="lg">
            {evidence?.status === 'VERIFIED' ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {evidence?.status || 'PENDING'}
          </Badge>
          <Badge variant="default" size="lg">
            Confidence: {evidence?.confidence ? `${(evidence.confidence * 100).toFixed(1)}%` : '-'}
          </Badge>
          {evidence?.alert && (
            <Badge variant="danger" size="lg">
              <ShieldAlert className="w-3.5 h-3.5" /> WATCHLIST MATCH
            </Badge>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Images */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setImageView('original')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  imageView === 'original'
                    ? 'bg-accent-muted text-accent border border-accent/30'
                    : 'bg-surface text-content-secondary border border-border hover:border-accent/20'
                }`}
              >
                <Image className="w-4 h-4" /> Full Frame
              </button>
              <button
                onClick={() => setImageView('cropped')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  imageView === 'cropped'
                    ? 'bg-accent-muted text-accent border border-accent/30'
                    : 'bg-surface text-content-secondary border border-border hover:border-accent/20'
                }`}
              >
                <Crosshair className="w-4 h-4" /> License Plate
              </button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-surface-inset">
              {imageView === 'original' ? (
                <img
                  src={evidence?.original_image_url}
                  alt="Original capture"
                  className="w-full h-auto"
                  crossOrigin="anonymous"
                />
              ) : (
                <img
                  src={evidence?.cropped_image_url}
                  alt="Cropped plate"
                  className="w-full h-auto"
                  crossOrigin="anonymous"
                />
              )}
            </div>

            <div className="flex gap-2">
              <a href={evidence?.original_image_url} download className="flex-1">
                <Button variant="secondary" className="w-full" icon={<Download className="w-4 h-4" />}>
                  Download Full Frame
                </Button>
              </a>
              <a href={evidence?.cropped_image_url} download className="flex-1">
                <Button variant="secondary" className="w-full" icon={<Download className="w-4 h-4" />}>
                  Download Plate
                </Button>
              </a>
            </div>
          </div>

          {/* Metadata */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-content flex items-center gap-2">
                  <Camera className="w-4 h-4 text-accent" /> Detection Details
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-content-tertiary mb-0.5">Camera</div>
                    <div className="text-content font-medium text-sm">{evidence?.camera_name || evidence?.camera_id || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-content-tertiary mb-0.5">Province</div>
                    <div className="text-content font-medium text-sm">{evidence?.province || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-content-tertiary mb-0.5">Timestamp</div>
                    <div className="text-content font-medium text-sm">
                      {evidence?.captured_at ? new Date(evidence.captured_at).toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        dateStyle: 'medium',
                        timeStyle: 'medium'
                      }) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-content-tertiary mb-0.5">Confidence</div>
                    <div className="text-content font-bold text-sm font-mono">
                      {evidence?.confidence ? `${(evidence.confidence * 100).toFixed(2)}%` : '-'}
                    </div>
                  </div>
                </div>
                {evidence?.bbox && (
                  <div>
                    <div className="text-xs text-content-tertiary mb-0.5">Bounding Box</div>
                    <div className="text-content font-mono text-xs bg-surface-inset px-3 py-2 rounded-lg">
                      {'x:'}{evidence.bbox.x}{', y:'}{evidence.bbox.y}{', w:'}{evidence.bbox.width}{', h:'}{evidence.bbox.height}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {evidence?.verification && (
              <Card className="border-success/30 bg-success-muted">
                <CardHeader>
                  <h3 className="text-sm font-semibold text-success-content flex items-center gap-2">
                    <Check className="w-4 h-4" /> Verification Info
                  </h3>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <div className="text-xs text-success-content/70">Verified By</div>
                    <div className="text-success-content font-medium text-sm">{evidence.verification.verified_by}</div>
                  </div>
                  <div>
                    <div className="text-xs text-success-content/70">Verified At</div>
                    <div className="text-success-content text-sm">
                      {new Date(evidence.verification.verified_at).toLocaleString('th-TH')}
                    </div>
                  </div>
                  {evidence.verification.notes && (
                    <div>
                      <div className="text-xs text-success-content/70">Notes</div>
                      <div className="text-success-content text-sm">{evidence.verification.notes}</div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {evidence?.alert && (
              <Card className="border-danger/30 bg-danger-muted">
                <CardHeader>
                  <h3 className="text-sm font-semibold text-danger-content flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" /> Watchlist Alert
                  </h3>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <div className="text-xs text-danger-content/70">Alert Level</div>
                    <Badge variant="danger">{evidence.alert.alert_level}</Badge>
                  </div>
                  <div>
                    <div className="text-xs text-danger-content/70">Reason</div>
                    <div className="text-danger-content text-sm">{evidence.alert.reason || 'No reason provided'}</div>
                  </div>
                  {evidence.alert.acknowledged ? (
                    <div className="pt-2 border-t border-danger/20">
                      <div className="text-xs text-danger-content/70 flex items-center gap-1.5">
                        <Check className="w-3 h-3" />
                        Acknowledged by {evidence.alert.acknowledged_by} on{' '}
                        {new Date(evidence.alert.acknowledged_at).toLocaleString('th-TH')}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="warning" size="lg">
                      <Clock className="w-3.5 h-3.5" /> Pending Acknowledgment
                    </Badge>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ===== MAIN ADVANCED SEARCH PAGE ===== */
export default function AdvancedSearch() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedReadId, setSelectedReadId] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    camera_id: '',
    province: '',
    start_date: '',
    end_date: '',
    min_confidence: '',
    status: '',
    watchlist_only: false,
    limit: 50,
    offset: 0
  })

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    
    setLoading(true)
    setError('')

    try {
      const data = await searchPlates(filters)
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFilters({
      q: '',
      camera_id: '',
      province: '',
      start_date: '',
      end_date: '',
      min_confidence: '',
      status: '',
      watchlist_only: false,
      limit: 50,
      offset: 0
    })
    setResults([])
  }

  const resultColumns = [
    {
      key: 'plate_text',
      label: 'Plate',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-content font-mono">{val}</div>
          {row.province && <div className="text-xs text-content-tertiary">{row.province}</div>}
        </div>
      )
    },
    {
      key: 'camera_id',
      label: 'Camera',
      render: (_, row) => (
        <span className="text-sm text-content-secondary">{row.camera_name || row.camera_id || '-'}</span>
      )
    },
    {
      key: 'captured_at',
      label: 'Timestamp',
      render: (val) => (
        <span className="text-sm text-content-secondary tabular-nums">
          {new Date(val).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      )
    },
    {
      key: 'confidence',
      label: 'Confidence',
      render: (val) => (
        <Badge variant={val >= 0.9 ? 'success' : 'warning'} size="sm">
          {(val * 100).toFixed(1)}%
        </Badge>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => (
        <div className="flex gap-1.5">
          <Badge variant={val === 'VERIFIED' ? 'success' : 'default'} size="sm">
            {val}
          </Badge>
          {row.watchlist_match && (
            <Badge variant="danger" size="sm">
              <ShieldAlert className="w-3 h-3" /> ALERT
            </Badge>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      cellClassName: 'text-right',
      render: (_, row) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setSelectedReadId(row.id)}
          icon={<Eye className="w-3.5 h-3.5" />}
        >
          Evidence
        </Button>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advanced Search"
        description="Search and review plate reads with comprehensive filters"
      />

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-bold text-content flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center text-accent">
              <Search className="w-4 h-4" />
            </div>
            Search Filters
          </h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSearch} className="space-y-5">
            {/* Row 1 */}
            <div className="grid md:grid-cols-3 gap-4">
              <Input
                label="Plate Number"
                placeholder="1กก1234 (partial match)"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                icon={<Search className="w-4 h-4" />}
              />
              <Input
                label="Camera ID"
                placeholder="cam-001"
                value={filters.camera_id}
                onChange={(e) => setFilters({ ...filters, camera_id: e.target.value })}
                icon={<Camera className="w-4 h-4" />}
              />
              <Input
                label="Province"
                placeholder="กรุงเทพ"
                value={filters.province}
                onChange={(e) => setFilters({ ...filters, province: e.target.value })}
                icon={<MapPin className="w-4 h-4" />}
              />
            </div>

            {/* Row 2 */}
            <div className="grid md:grid-cols-4 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              />
              <Input
                label="End Date"
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              />
              <Input
                label="Min Confidence (%)"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="85"
                value={filters.min_confidence}
                onChange={(e) => setFilters({ ...filters, min_confidence: e.target.value })}
              />
              <Select
                label="Status"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
              </Select>
            </div>

            {/* Row 3 */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 text-sm text-content-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.watchlist_only}
                  onChange={(e) => setFilters({ ...filters, watchlist_only: e.target.checked })}
                  className="rounded border-border bg-surface text-accent focus:ring-accent w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-danger" />
                  Watchlist matches only
                </span>
              </label>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                  Reset
                </Button>
                <Button type="submit" variant="primary" loading={loading} icon={<Search className="w-4 h-4" />}>
                  Search
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Error */}
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

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-content">
              Search Results ({results.length})
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <DataTable
              columns={resultColumns}
              data={results}
              emptyMessage="No results found"
            />
          </CardBody>
        </Card>
      )}

      {!loading && results.length === 0 && filters.q && (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Search className="w-8 h-8" />}
              title="No results found"
              description="Try adjusting your search filters for different results."
              action={
                <Button variant="secondary" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                  Reset Filters
                </Button>
              }
            />
          </CardBody>
        </Card>
      )}

      {/* Evidence Viewer Modal */}
      {selectedReadId && (
        <EvidenceViewer
          readId={selectedReadId}
          onClose={() => setSelectedReadId(null)}
        />
      )}
    </div>
  )
}
