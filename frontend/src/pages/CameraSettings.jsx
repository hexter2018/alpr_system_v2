import React, { useState, useEffect, useRef } from 'react'
import { Stage, Layer, Line, Circle, Image as KonvaImage } from 'react-konva'
import { Button, Card, CardHeader, CardBody, Input, Badge, Spinner } from '../components/UIComponents.jsx'
import { API_BASE } from '../lib/api.js'

/* ===== TOAST NOTIFICATION ===== */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200',
    error: 'bg-rose-500/20 border-rose-400/40 text-rose-200',
    info: 'bg-blue-500/20 border-blue-400/40 text-blue-200',
  }
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm animate-fade-in ${colors[type]}`}>
      <span className="text-lg font-bold">{icons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">✕</button>
    </div>
  )
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = (message, type = 'success') => setToast({ message, type })
  const hide = () => setToast(null)
  const ToastEl = toast ? <Toast message={toast.message} type={toast.type} onClose={hide} /> : null
  return { show, ToastEl }
}

/* ===== ADD / EDIT CAMERA MODAL ===== */
function CameraModal({ open, onClose, onSave, editCamera = null }) {
  const isEdit = !!editCamera
  const [formData, setFormData] = useState({
    camera_id: '',
    name: '',
    rtsp_url: '',
    enabled: true,
    fps: 2.0
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editCamera) {
      setFormData({
        camera_id: editCamera.camera_id || '',
        name: editCamera.name || '',
        rtsp_url: editCamera.rtsp_url || '',
        enabled: editCamera.enabled !== false,
        fps: editCamera.fps || 2.0
      })
    } else {
      setFormData({ camera_id: '', name: '', rtsp_url: '', enabled: true, fps: 2.0 })
    }
    setError('')
  }, [editCamera, open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const url = isEdit
        ? `${API_BASE}/api/cameras/${editCamera.camera_id}`
        : `${API_BASE}/api/cameras`
      const method = isEdit ? 'PATCH' : 'POST'
      const body = isEdit
        ? { name: formData.name, rtsp_url: formData.rtsp_url, enabled: formData.enabled, fps: formData.fps }
        : formData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to ${isEdit ? 'update' : 'create'} camera`)
      }
      onSave()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-100">
              {isEdit ? `Edit: ${editCamera.name || editCamera.camera_id}` : 'Add New Camera'}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-300/40 rounded-lg text-rose-200 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Camera ID *"
              value={formData.camera_id}
              onChange={(e) => setFormData({ ...formData, camera_id: e.target.value })}
              placeholder="cam-001"
              required
              disabled={isEdit}
              hint={isEdit ? 'Camera ID cannot be changed' : 'Unique identifier for this camera'}
            />
            <Input
              label="Camera Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Main Entrance"
              required
              hint="Friendly name for this camera"
            />
            <Input
              label="RTSP URL"
              value={formData.rtsp_url}
              onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
              placeholder="rtsp://username:password@192.168.1.100:554/stream"
              hint="Optional — RTSP stream URL for live monitoring"
            />
            <Input
              label="FPS"
              type="number"
              step="0.1"
              min="0.5"
              max="30"
              value={formData.fps}
              onChange={(e) => setFormData({ ...formData, fps: parseFloat(e.target.value) })}
              hint="Frames per second for processing"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded border-slate-600 bg-slate-900/50 text-blue-500 focus:ring-blue-500"
              />
              <span>Enable camera</span>
            </label>
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !formData.camera_id || !formData.name}
                className="flex-1"
              >
                {saving ? (
                  <><Spinner size="sm" className="mr-2" />{isEdit ? 'Saving...' : 'Creating...'}</>
                ) : (
                  isEdit ? 'Save Changes' : 'Add Camera'
                )}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ===== VISUAL TRIGGER ZONE EDITOR ===== */
function TriggerZoneEditor({ camera, onSave }) {
  const [points, setPoints] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [snapshot, setSnapshot] = useState(null)
  const [imageObj, setImageObj] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [loading, setLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState(null)
  const [snapshotSource, setSnapshotSource] = useState(null) // 'live' | 'db'
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const stageRef = useRef(null)
  const blobUrlRef = useRef(null)

  const loadSnapshot = () => {
    if (!camera?.camera_id) return

    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    setLoading(true)
    setSnapshotError(null)
    setImageObj(null)
    setSnapshotSource(null)

    fetch(`${API_BASE}/api/cameras/${camera.camera_id}/snapshot`)
      .then(res => {
        if (!res.ok) throw new Error(
          res.status === 404
            ? `No snapshot available — upload an image for "${camera.camera_id}" or wait for stream to start`
            : `Server error ${res.status}`
        )
        const src = res.headers.get('X-Snapshot-Source')
        setSnapshotSource(src)
        return res.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        const img = new window.Image()
        img.onload = () => {
          setImageObj(img)
          const maxW = 800, maxH = 600
          const scale = Math.min(maxW / img.width, maxH / img.height, 1)
          setDimensions({ width: img.width * scale, height: img.height * scale })
          setLoading(false)
        }
        img.onerror = () => {
          setSnapshotError('Failed to decode snapshot image')
          setLoading(false)
        }
        img.src = url
        setSnapshot(url)
      })
      .catch(err => {
        setSnapshotError(err.message)
        setImageObj(null)
        setLoading(false)
      })
  }

  // Load snapshot when camera changes
  useEffect(() => {
    if (!camera?.camera_id) {
      setImageObj(null)
      setLoading(false)
      return
    }
    loadSnapshot()
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [camera?.camera_id])

  // Load existing trigger zone
  useEffect(() => {
    if (camera?.trigger_zone?.points) {
      setPoints(camera.trigger_zone.points.map(([x, y]) => ({ x, y })))
    } else {
      setPoints([])
    }
    setSaveSuccess(false)
  }, [camera])

  const handleStageClick = (e) => {
    if (!isDrawing) return
    const stage = e.target.getStage()
    const pointer = stage.getPointerPosition()
    setPoints([...points, { x: pointer.x, y: pointer.y }])
  }

  const handlePointDragMove = (index, e) => {
    const newPoints = [...points]
    newPoints[index] = { x: e.target.x(), y: e.target.y() }
    setPoints(newPoints)
  }

  const handleSave = async () => {
    const normalizedPoints = points.map(p => [p.x, p.y])
    setSaving(true)
    setSaveSuccess(false)
    try {
      await onSave(normalizedPoints)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      // error handled in parent
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setPoints([])
    setIsDrawing(false)
  }

  const flatPoints = points.flatMap(p => [p.x, p.y])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Trigger Zone Editor</h3>
            <p className="text-xs text-slate-400 mt-1">
              Define the zone where vehicle detection triggers OCR processing
            </p>
          </div>
          <div className="flex items-center gap-2">
            {snapshotSource && (
              <Badge variant={snapshotSource === 'live' ? 'success' : 'info'} size="sm">
                {snapshotSource === 'live' ? '🔴 Live' : '🖼 Stored'}
              </Badge>
            )}
            <Badge variant={isDrawing ? 'success' : 'default'}>
              {isDrawing ? `Drawing (${points.length} pts)` : `${points.length} points`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">

          {/* Controls */}
          <div className="flex gap-2 flex-wrap items-center">
            {!isDrawing ? (
              <Button variant="primary" onClick={() => { setIsDrawing(true); setPoints([]) }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Start Drawing
              </Button>
            ) : (
              <Button variant="success" onClick={() => setIsDrawing(false)} disabled={points.length < 3}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Finish ({points.length}/3+ pts)
              </Button>
            )}

            <Button variant="secondary" onClick={handleClear} disabled={points.length === 0}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Clear
            </Button>

            <Button
              variant={saveSuccess ? 'success' : 'primary'}
              onClick={handleSave}
              disabled={points.length < 3 || isDrawing || saving}
            >
              {saving ? (
                <><Spinner size="sm" className="mr-2" />Saving...</>
              ) : saveSuccess ? (
                <>✓ Saved!</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                  </svg>
                  Save Zone
                </>
              )}
            </Button>

            {/* Refresh snapshot */}
            <button
              onClick={loadSnapshot}
              disabled={loading}
              title="Refresh snapshot"
              className="ml-auto p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Instruction hint */}
          <div className="text-sm min-h-[1.5rem]">
            {isDrawing && (
              <p className="text-emerald-400">✓ Click on the image to add points. Need at least 3 points to finish.</p>
            )}
            {!isDrawing && points.length > 0 && !saveSuccess && (
              <p className="text-blue-400">✓ Drag points to adjust the zone, then click "Save Zone".</p>
            )}
            {saveSuccess && (
              <p className="text-emerald-400">✓ Trigger zone saved successfully!</p>
            )}
            {!isDrawing && points.length === 0 && (
              <p className="text-slate-400">Click "Start Drawing" then click on the image to define the trigger zone polygon.</p>
            )}
          </div>

          {/* Canvas */}
          <div className="border border-blue-300/20 rounded-xl overflow-hidden bg-slate-950/40">
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <Spinner size="lg" className="text-blue-500" />
                <span className="ml-3 text-slate-400">Loading snapshot...</span>
              </div>
            ) : !imageObj ? (
              <div className="flex flex-col items-center justify-center h-96 p-8 text-center">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-slate-300 font-semibold mb-2">No Snapshot Available</p>
                {snapshotError ? (
                  <p className="text-sm text-slate-400 max-w-md">{snapshotError}</p>
                ) : (
                  <p className="text-sm text-slate-400 max-w-md">
                    Upload an image for camera <code className="text-blue-300">{camera?.camera_id}</code> or wait for the RTSP stream to connect.
                  </p>
                )}
                <button
                  onClick={loadSnapshot}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try Again
                </button>
              </div>
            ) : (
              <Stage
                width={dimensions.width}
                height={dimensions.height}
                onClick={handleStageClick}
                ref={stageRef}
                style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
              >
                <Layer>
                  <KonvaImage image={imageObj} width={dimensions.width} height={dimensions.height} />

                  {points.length > 0 && (
                    <Line
                      points={flatPoints}
                      stroke="#10b981"
                      strokeWidth={3}
                      closed={!isDrawing && points.length >= 3}
                      fill={!isDrawing && points.length >= 3 ? 'rgba(16, 185, 129, 0.18)' : undefined}
                    />
                  )}

                  {points.map((point, i) => (
                    <Circle
                      key={i}
                      x={point.x}
                      y={point.y}
                      radius={8}
                      fill="#10b981"
                      stroke="#fff"
                      strokeWidth={2}
                      draggable={!isDrawing}
                      onDragMove={(e) => handlePointDragMove(i, e)}
                    />
                  ))}
                </Layer>
              </Stage>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

/* ===== CAMERA SETTINGS PAGE ===== */
export default function CameraSettings() {
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editCamera, setEditCamera] = useState(null)
  const { show: showToast, ToastEl } = useToast()

  useEffect(() => { loadCameras() }, [])

  async function loadCameras() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/cameras`)
      if (!res.ok) throw new Error('Failed to load cameras')
      const data = await res.json()
      setCameras(data)
      if (data.length > 0 && !selectedCamera) {
        setSelectedCamera(data[0])
      } else if (selectedCamera) {
        // Refresh selected camera data
        const updated = data.find(c => c.camera_id === selectedCamera.camera_id)
        if (updated) setSelectedCamera(updated)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveTriggerZone(points) {
    if (!selectedCamera) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCamera.camera_id}/trigger-zone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_zone: { points, zone_type: 'polygon' } })
      })
      if (!res.ok) throw new Error('Failed to save trigger zone')
      await loadCameras()
      showToast('Trigger zone saved successfully!', 'success')
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCamera(camera) {
    if (!window.confirm(`Delete camera "${camera.name || camera.camera_id}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_BASE}/api/cameras/${camera.camera_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete camera')
      if (selectedCamera?.camera_id === camera.camera_id) setSelectedCamera(null)
      await loadCameras()
      showToast(`Camera "${camera.name || camera.camera_id}" deleted`, 'info')
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error')
    }
  }

  const openAdd = () => { setEditCamera(null); setShowModal(true) }
  const openEdit = (cam) => { setEditCamera(cam); setShowModal(true) }
  const handleModalSave = () => { loadCameras(); showToast(editCamera ? 'Camera updated!' : 'Camera added!', 'success') }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" className="text-blue-500" />
        <span className="ml-3 text-slate-300">Loading cameras...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="bg-rose-500/10 border-rose-300/40">
        <CardBody>
          <p className="text-rose-200">{error}</p>
          <button onClick={loadCameras} className="mt-3 text-sm text-blue-400 hover:underline">Retry</button>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {ToastEl}

      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-600/20 via-blue-500/10 to-cyan-500/10">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Camera Settings</h1>
              <p className="text-sm text-slate-300 mt-1">
                Configure trigger zones and camera parameters
              </p>
            </div>
            <Button variant="primary" onClick={openAdd}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Camera
            </Button>
          </div>
        </CardBody>
      </Card>

      {cameras.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📹</div>
              <p className="text-slate-400 mb-2">No cameras configured yet.</p>
              <Button variant="primary" onClick={openAdd}>
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add a camera to get started
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">

          {/* Camera List */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-100">
                Cameras <span className="text-slate-500 font-normal">({cameras.length})</span>
              </h3>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-slate-700/50">
                {cameras.map(camera => (
                  <div
                    key={camera.camera_id}
                    className={`transition-colors ${
                      selectedCamera?.camera_id === camera.camera_id
                        ? 'bg-blue-500/20 border-l-4 border-blue-400'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedCamera(camera)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-100 text-sm truncate">
                            {camera.name || camera.camera_id}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {camera.camera_id}
                          </div>
                        </div>
                        <Badge variant={camera.status === 'ONLINE' ? 'success' : 'default'} size="sm">
                          {camera.status || 'OFFLINE'}
                        </Badge>
                      </div>

                      {camera.trigger_zone?.points && (
                        <div className="text-xs text-emerald-400 mt-2">
                          ✓ Zone configured ({camera.trigger_zone.points.length} points)
                        </div>
                      )}

                      {camera.rtsp_url && (
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          🔗 {camera.rtsp_url}
                        </div>
                      )}
                    </button>

                    {/* Action buttons */}
                    <div className="px-4 pb-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(camera) }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCamera(camera) }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 text-xs transition-colors"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Trigger Zone Editor */}
          {selectedCamera ? (
            <TriggerZoneEditor
              camera={selectedCamera}
              onSave={handleSaveTriggerZone}
            />
          ) : (
            <Card>
              <CardBody>
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="text-4xl mb-3">👈</div>
                  <p className="text-slate-400 text-sm">Select a camera to edit its trigger zone</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Add / Edit Camera Modal */}
      <CameraModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleModalSave}
        editCamera={editCamera}
      />
    </div>
  )
}