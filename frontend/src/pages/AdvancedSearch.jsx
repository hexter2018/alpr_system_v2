import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardBody, Badge, Button, Input, Spinner } from '../components/UIComponents.jsx'
import { searchPlates, getEvidence } from '../lib/management-api.js'
import { API_BASE } from '../lib/api.js'

/* ===== EVIDENCE VIEWER MODAL ===== */
function EvidenceViewer({ readId, onClose }) {
  const [evidence, setEvidence] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imageView, setImageView] = useState('original') // 'original' or 'cropped'

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
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
          <Spinner size="lg" className="text-blue-500" />
          <p className="text-slate-300 mt-4">Loading evidence...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 border border-rose-500 rounded-xl p-8 max-w-md">
          <p className="text-rose-200">{error}</p>
          <Button variant="secondary" onClick={onClose} className="mt-4">Close</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">
                {evidence?.plate_text || 'Unknown'}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={evidence?.status === 'VERIFIED' ? 'success' : 'warning'}>
                  {evidence?.status || 'PENDING'}
                </Badge>
                <Badge variant="default">
                  Confidence: {evidence?.confidence ? `${(evidence.confidence * 100).toFixed(1)}%` : '-'}
                </Badge>
                {evidence?.alert && (
                  <Badge variant="danger">WATCHLIST MATCH</Badge>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Images */}
            <div className="space-y-4">
              {/* Image Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setImageView('original')}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                    imageView === 'original'
                      ? 'bg-blue-500/20 text-blue-200 border-2 border-blue-500'
                      : 'bg-slate-700/30 text-slate-400 border-2 border-slate-600'
                  }`}
                >
                  Full Frame
                </button>
                <button
                  onClick={() => setImageView('cropped')}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                    imageView === 'cropped'
                      ? 'bg-blue-500/20 text-blue-200 border-2 border-blue-500'
                      : 'bg-slate-700/30 text-slate-400 border-2 border-slate-600'
                  }`}
                >
                  License Plate
                </button>
              </div>

              {/* Image Display */}
              <div className="border border-blue-300/20 rounded-xl overflow-hidden bg-slate-950/40">
                {imageView === 'original' ? (
                  <img
                    src={evidence?.original_image_url}
                    alt="Original capture"
                    className="w-full h-auto"
                  />
                ) : (
                  <img
                    src={evidence?.cropped_image_url}
                    alt="Cropped plate"
                    className="w-full h-auto"
                  />
                )}
              </div>

              {/* Download Buttons */}
              <div className="flex gap-2">
                <a
                  href={evidence?.original_image_url}
                  download
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Download Full Frame
                  </Button>
                </a>
                <a
                  href={evidence?.cropped_image_url}
                  download
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Download Plate
                  </Button>
                </a>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-slate-100">Detection Details</h3>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-400">Camera</div>
                    <div className="text-slate-100 font-medium">{evidence?.camera_name || evidence?.camera_id || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Timestamp</div>
                    <div className="text-slate-100 font-medium">
                      {evidence?.captured_at ? new Date(evidence.captured_at).toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        dateStyle: 'medium',
                        timeStyle: 'medium'
                      }) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Province</div>
                    <div className="text-slate-100 font-medium">{evidence?.province || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Confidence Score</div>
                    <div className="text-slate-100 font-medium">
                      {evidence?.confidence ? `${(evidence.confidence * 100).toFixed(2)}%` : '-'}
                    </div>
                  </div>
                  {evidence?.bbox && (
                    <div>
                      <div className="text-xs text-slate-400">Bounding Box</div>
                      <div className="text-slate-100 font-mono text-xs">
                        x:{evidence.bbox.x}, y:{evidence.bbox.y}, w:{evidence.bbox.width}, h:{evidence.bbox.height}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>

              {evidence?.verification && (
                <Card className="bg-emerald-500/10 border-emerald-300/40">
                  <CardHeader>
                    <h3 className="text-sm font-semibold text-emerald-100">Verification Info</h3>
                  </CardHeader>
                  <CardBody className="space-y-2">
                    <div>
                      <div className="text-xs text-emerald-400">Verified By</div>
                      <div className="text-emerald-100">{evidence.verification.verified_by}</div>
                    </div>
                    <div>
                      <div className="text-xs text-emerald-400">Verified At</div>
                      <div className="text-emerald-100">
                        {new Date(evidence.verification.verified_at).toLocaleString('th-TH')}
                      </div>
                    </div>
                    {evidence.verification.notes && (
                      <div>
                        <div className="text-xs text-emerald-400">Notes</div>
                        <div className="text-emerald-100 text-sm">{evidence.verification.notes}</div>
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {evidence?.alert && (
                <Card className="bg-rose-500/10 border-rose-300/40">
                  <CardHeader>
                    <h3 className="text-sm font-semibold text-rose-100">⚠️ Watchlist Alert</h3>
                  </CardHeader>
                  <CardBody className="space-y-2">
                    <div>
                      <div className="text-xs text-rose-400">Alert Level</div>
                      <Badge variant="danger">{evidence.alert.alert_level}</Badge>
                    </div>
                    <div>
                      <div className="text-xs text-rose-400">Reason</div>
                      <div className="text-rose-100">{evidence.alert.reason || 'No reason provided'}</div>
                    </div>
                    {evidence.alert.acknowledged ? (
                      <div className="pt-2 border-t border-rose-400/20">
                        <div className="text-xs text-rose-300">
                          ✓ Acknowledged by {evidence.alert.acknowledged_by} on{' '}
                          {new Date(evidence.alert.acknowledged_at).toLocaleString('th-TH')}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2">
                        <Badge variant="warning">⏳ Pending Acknowledgment</Badge>
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-600/20 via-purple-500/10 to-blue-500/10">
        <CardBody>
          <h1 className="text-2xl font-bold text-slate-100">Advanced Search</h1>
          <p className="text-sm text-slate-300 mt-1">
            Search and review plate reads with comprehensive filters
          </p>
        </CardBody>
      </Card>

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-slate-100">Search Filters</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Row 1 */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Plate Number
                </label>
                <Input
                  placeholder="1กก1234 (partial match)"
                  value={filters.q}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Camera ID
                </label>
                <Input
                  placeholder="cam-001"
                  value={filters.camera_id}
                  onChange={(e) => setFilters({ ...filters, camera_id: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Province
                </label>
                <Input
                  placeholder="กรุงเทพ"
                  value={filters.province}
                  onChange={(e) => setFilters({ ...filters, province: e.target.value })}
                />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  End Date
                </label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Min Confidence (%)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="85"
                  value={filters.min_confidence}
                  onChange={(e) => setFilters({ ...filters, min_confidence: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-100"
                >
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                </select>
              </div>
            </div>

            {/* Row 3 - Checkboxes and Actions */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.watchlist_only}
                  onChange={(e) => setFilters({ ...filters, watchlist_only: e.target.checked })}
                  className="rounded border-slate-600 bg-slate-900/50 text-rose-500 focus:ring-rose-500"
                />
                <span>Watchlist matches only</span>
              </label>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleReset}>
                  Reset
                </Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                      </svg>
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Results */}
      {error && (
        <Card className="bg-rose-500/10 border-rose-300/40">
          <CardBody>
            <p className="text-rose-200">{error}</p>
          </CardBody>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-100">
              Search Results ({results.length})
            </h2>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Plate</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Camera</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Timestamp</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Confidence</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {results.map(result => (
                    <tr key={result.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{result.plate_text}</div>
                        {result.province && (
                          <div className="text-xs text-slate-400">{result.province}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300">
                        {result.camera_name || result.camera_id || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300">
                        {new Date(result.captured_at).toLocaleString('th-TH', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={result.confidence >= 0.9 ? 'success' : 'warning'}>
                          {(result.confidence * 100).toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Badge variant={result.status === 'VERIFIED' ? 'success' : 'default'}>
                            {result.status}
                          </Badge>
                          {result.watchlist_match && (
                            <Badge variant="danger">ALERT</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setSelectedReadId(result.id)}
                        >
                          View Evidence
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {!loading && results.length === 0 && filters.q && (
        <Card>
          <CardBody>
            <div className="text-center py-12 text-slate-400">
              No results found. Try adjusting your search filters.
            </div>
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