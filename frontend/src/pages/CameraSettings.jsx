import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Line, Circle, Image as KonvaImage } from 'react-konva'
import { Button, Card, CardHeader, CardBody, Input, Badge, Spinner, Modal, PageHeader, EmptyState } from '../components/UIComponents.jsx'
import { API_BASE, apiFetch } from '../lib/api.js'
import {
  Plus, Pencil, Trash2, Camera, RefreshCw, CheckCircle,
  Video, AlertCircle, X, Save, Crosshair,
} from 'lucide-react'

/* ===== TOAST ===== */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  const styles = {
    success: 'bg-success-muted border border-success/30 text-success-content',
    error: 'bg-danger-muted border border-danger/30 text-danger-content',
    info: 'bg-accent-muted border border-accent/30 text-accent',
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl ${styles[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
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
  const [formData, setFormData] = useState({ camera_id: '', name: '', rtsp_url: '', enabled: true, fps: 2.0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editCamera) {
      setFormData({
        camera_id: editCamera.camera_id || '',
        name: editCamera.name || '',
        rtsp_url: editCamera.rtsp_url || '',
        enabled: editCamera.enabled !== false,
        fps: editCamera.fps || 2.0,
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
      const url = isEdit ? `${API_BASE}/api/cameras/${editCamera.camera_id}` : `${API_BASE}/api/cameras`
      const method = isEdit ? 'PATCH' : 'POST'
      const body = isEdit
        ? { name: formData.name, rtsp_url: formData.rtsp_url, enabled: formData.enabled, fps: formData.fps }
        : formData
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit: ${editCamera.name || editCamera.camera_id}` : 'Add New Camera'} size="md">
      {error && (
        <div className="mb-4 p-3 bg-danger-muted border border-danger/30 rounded-lg text-danger-content text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Camera ID *" value={formData.camera_id}
          onChange={(e) => setFormData({ ...formData, camera_id: e.target.value })}
          placeholder="cam-001" required disabled={isEdit}
          hint={isEdit ? 'Camera ID cannot be changed' : 'Unique identifier'} />
        <Input label="Camera Name *" value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Main Entrance" required />
        <Input label="RTSP URL" value={formData.rtsp_url}
          onChange={(e) => setFormData({ ...formData, rtsp_url: e.target.value })}
          placeholder="rtsp://user:pass@192.168.1.100:554/stream"
          hint="RTSP stream URL for live monitoring" />
        <Input label="FPS" type="number" step="0.1" min="0.5" max="30"
          value={formData.fps}
          onChange={(e) => setFormData({ ...formData, fps: parseFloat(e.target.value) })}
          hint="Frames per second for processing" />
        <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer select-none">
          <input type="checkbox" checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded border-border accent-accent" />
          <span>Enable camera</span>
        </label>
        <div className="flex gap-3 pt-4">
          <Button type="submit" variant="primary"
            disabled={saving || !formData.camera_id || !formData.name} className="flex-1"
            loading={saving}>
            {isEdit ? 'Save Changes' : 'Add Camera'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== TRIGGER ZONE EDITOR ===== */
const DISPLAY_W = 800
const DISPLAY_H = 600

function TriggerZoneEditor({ camera, onSave }) {
  const [points, setPoints] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [imageObj, setImageObj] = useState(null)
  const [dimensions, setDimensions] = useState({ width: DISPLAY_W, height: DISPLAY_H })
  const [loading, setLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState(null)
  const [streamMode, setStreamMode] = useState('idle')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const stageRef = useRef(null)
  const blobUrlRef = useRef(null)
  const pollTimerRef = useRef(null)

  const loadSnapshot = useCallback(() => {
    if (!camera?.camera_id) return
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    apiFetch(`${API_BASE}/api/cameras/${camera.camera_id}/snapshot`)
      .then((res) => {
        if (!res.ok) { const err = new Error(res.status === 404 ? 'No snapshot available' : `Server error ${res.status}`); err.status = res.status; throw err }
        return res.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const scale = Math.min(DISPLAY_W / img.naturalWidth, DISPLAY_H / img.naturalHeight, 1)
          setDimensions({ width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) })
          setImageObj(img)
          setLoading(false)
          setSnapshotError(null)
        }
        img.onerror = () => { setSnapshotError('Failed to decode snapshot'); setLoading(false) }
        img.src = url
      })
      .catch((err) => {
        if (err?.status === 404 && pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
        setSnapshotError(err.message); setLoading(false)
      })
  }, [camera?.camera_id])

  const stopStream = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    setStreamMode('idle')
  }, [])

  const startStream = useCallback(() => {
    if (!camera?.camera_id) return
    stopStream(); setLoading(true); setSnapshotError(null)
    const mjpegUrl = `${API_BASE}/api/cameras/${camera.camera_id}/stream`
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 3000)
    apiFetch(mjpegUrl, { method: 'HEAD', signal: ctrl.signal }, 3000)
      .then((res) => { clearTimeout(timeout); if (res.ok || res.status === 200) { setStreamMode('mjpeg'); setLoading(false) } else { throw new Error('no stream endpoint') } })
      .catch(() => { clearTimeout(timeout); setStreamMode('polling'); loadSnapshot(); pollTimerRef.current = setInterval(loadSnapshot, 2000) })
  }, [camera?.camera_id, loadSnapshot, stopStream])

  useEffect(() => {
    if (!camera?.camera_id) { stopStream(); setImageObj(null); setPoints([]); return }
    startStream()
    return () => { stopStream(); if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null } }
  }, [camera?.camera_id]) // eslint-disable-line

  useEffect(() => {
    if (camera?.trigger_zone?.points?.length > 0) {
      const pts = camera.trigger_zone.points
      const isNorm = pts.every(([x, y]) => x <= 1.0 && y <= 1.0)
      if (isNorm) { setPoints(pts.map(([x, y]) => ({ x: x * dimensions.width, y: y * dimensions.height }))) }
      else { setPoints(pts.map(([x, y]) => ({ x, y }))) }
    } else { setPoints([]) }
    setSaveSuccess(false)
  }, [camera?.camera_id]) // eslint-disable-line

  const handleMjpegLoad = (e) => {
    const img = e.target
    const nw = img.naturalWidth || img.width; const nh = img.naturalHeight || img.height
    if (nw && nh) { const scale = Math.min(DISPLAY_W / nw, DISPLAY_H / nh, 1); setDimensions({ width: Math.round(nw * scale), height: Math.round(nh * scale) }) }
    setLoading(false)
  }
  const handleMjpegError = () => {
    setStreamMode('polling'); loadSnapshot()
    if (!pollTimerRef.current) { pollTimerRef.current = setInterval(loadSnapshot, 2000) }
  }

  const handleStageClick = (e) => { if (!isDrawing) return; const pos = e.target.getStage().getPointerPosition(); setPoints((prev) => [...prev, { x: pos.x, y: pos.y }]) }
  const handlePointDragMove = (index, e) => { const newPoints = [...points]; newPoints[index] = { x: e.target.x(), y: e.target.y() }; setPoints(newPoints) }

  const handleSave = async () => {
    const normalizedPoints = points.map((p) => [parseFloat((p.x / dimensions.width).toFixed(6)), parseFloat((p.y / dimensions.height).toFixed(6))])
    setSaving(true); setSaveSuccess(false)
    try { await onSave(normalizedPoints); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000) }
    catch (err) { /* error handled by parent */ }
    finally { setSaving(false) }
  }

  const flatPoints = points.flatMap((p) => [p.x, p.y])
  const isMjpeg = streamMode === 'mjpeg'
  const mjpegUrl = `${API_BASE}/api/cameras/${camera?.camera_id}/stream`

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold text-content">Trigger Zone Editor</h3>
            <p className="text-xs text-content-tertiary mt-0.5">Define the detection zone for OCR processing</p>
          </div>
          <div className="flex items-center gap-2">
            {streamMode === 'mjpeg' && <Badge variant="success" size="sm" dot>Live Stream</Badge>}
            {streamMode === 'polling' && <Badge variant="warning" size="sm" dot>Snapshot (2s)</Badge>}
            <Badge variant={isDrawing ? 'success' : 'default'} size="sm">
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
              <Button variant="primary" size="sm" onClick={() => { setIsDrawing(true); setPoints([]) }} icon={<Crosshair className="w-4 h-4" />}>
                Start Drawing
              </Button>
            ) : (
              <Button variant="success" size="sm" onClick={() => setIsDrawing(false)} disabled={points.length < 3} icon={<CheckCircle className="w-4 h-4" />}>
                Finish ({points.length}/3+ pts)
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => { setPoints([]); setIsDrawing(false) }} disabled={points.length === 0}>Clear</Button>
            <Button variant={saveSuccess ? 'success' : 'primary'} size="sm" onClick={handleSave}
              disabled={points.length < 3 || isDrawing || saving} loading={saving}
              icon={saveSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}>
              {saveSuccess ? 'Saved!' : 'Save Zone'}
            </Button>
            <button onClick={startStream} disabled={loading} title="Refresh stream"
              className="ml-auto p-2 rounded-lg text-content-tertiary hover:text-content hover:bg-surface-overlay transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Hints */}
          <div className="text-sm min-h-[1.25rem]">
            {isDrawing && <p className="text-success">Click on the image to add points. Need 3+ to finish.</p>}
            {!isDrawing && points.length > 0 && !saveSuccess && <p className="text-accent">Drag points to fine-tune, then "Save Zone".</p>}
            {saveSuccess && <p className="text-success">Trigger zone saved successfully!</p>}
            {!isDrawing && points.length === 0 && <p className="text-content-tertiary">{'Click "Start Drawing" then click on the image to define the polygon.'}</p>}
          </div>

          {/* Canvas area */}
          <div className="border border-border rounded-xl overflow-hidden bg-surface-inset relative">
            {loading && (
              <div className="flex items-center justify-center h-96">
                <Spinner size="lg" />
                <span className="ml-3 text-content-secondary">Connecting to stream...</span>
              </div>
            )}
            {!loading && !isMjpeg && !imageObj && (
              <div className="flex flex-col items-center justify-center h-96 p-8 text-center">
                <Camera className="w-12 h-12 text-content-tertiary mb-4" />
                <p className="text-content font-semibold mb-2">No Stream Available</p>
                {snapshotError
                  ? <p className="text-sm text-content-secondary max-w-md">{snapshotError}</p>
                  : <p className="text-sm text-content-secondary max-w-md">
                      {'Upload an image for '}<code className="text-accent">{camera?.camera_id}</code>{' or wait for the RTSP stream to connect.'}
                    </p>
                }
                <Button variant="secondary" size="sm" onClick={startStream} className="mt-4" icon={<RefreshCw className="w-4 h-4" />}>Try Again</Button>
              </div>
            )}
            {isMjpeg && (
              <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
                <img src={mjpegUrl} onLoad={handleMjpegLoad} onError={handleMjpegError}
                  style={{ width: dimensions.width, height: dimensions.height, display: 'block', objectFit: 'contain' }}
                  alt="Live MJPEG stream" crossOrigin="anonymous" />
                <div className="absolute inset-0 pointer-events-auto">
                  <Stage width={dimensions.width} height={dimensions.height} onClick={handleStageClick} ref={stageRef}
                    style={{ cursor: isDrawing ? 'crosshair' : 'default' }}>
                    <Layer>
                      {points.length > 0 && (
                        <Line points={flatPoints} stroke="#3b82f6" strokeWidth={3}
                          closed={!isDrawing && points.length >= 3}
                          fill={!isDrawing && points.length >= 3 ? 'rgba(59,130,246,0.18)' : undefined} />
                      )}
                      {points.map((pt, i) => (
                        <Circle key={i} x={pt.x} y={pt.y} radius={8}
                          fill="#3b82f6" stroke="#fff" strokeWidth={2}
                          draggable={!isDrawing}
                          onDragMove={(e) => handlePointDragMove(i, e)} />
                      ))}
                    </Layer>
                  </Stage>
                </div>
              </div>
            )}
            {!isMjpeg && imageObj && !loading && (
              <Stage width={dimensions.width} height={dimensions.height} onClick={handleStageClick} ref={stageRef}
                style={{ cursor: isDrawing ? 'crosshair' : 'default' }}>
                <Layer>
                  <KonvaImage image={imageObj} width={dimensions.width} height={dimensions.height} />
                  {points.length > 0 && (
                    <Line points={flatPoints} stroke="#3b82f6" strokeWidth={3}
                      closed={!isDrawing && points.length >= 3}
                      fill={!isDrawing && points.length >= 3 ? 'rgba(59,130,246,0.18)' : undefined} />
                  )}
                  {points.map((pt, i) => (
                    <Circle key={i} x={pt.x} y={pt.y} radius={8}
                      fill="#3b82f6" stroke="#fff" strokeWidth={2}
                      draggable={!isDrawing}
                      onDragMove={(e) => handlePointDragMove(i, e)} />
                  ))}
                </Layer>
              </Stage>
            )}
          </div>

          {points.length > 0 && (
            <p className="text-xs text-content-tertiary">
              Points stored as normalized (0-1) coordinates. Backend must scale by actual frame resolution.
            </p>
          )}
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
    setLoading(true); setError('')
    try {
      const res = await apiFetch(`${API_BASE}/api/cameras`)
      if (!res.ok) throw new Error('Failed to load cameras')
      const data = await res.json()
      setCameras(data)
      if (data.length > 0 && !selectedCamera) { setSelectedCamera(data[0]) }
      else if (selectedCamera) {
        const updated = data.find((c) => c.camera_id === selectedCamera.camera_id)
        if (updated) setSelectedCamera(updated)
      }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function handleSaveTriggerZone(normalizedPoints) {
    if (!selectedCamera) return
    setSaving(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/cameras/${selectedCamera.camera_id}/trigger-zone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_zone: { points: normalizedPoints, zone_type: 'polygon' } }),
      })
      if (!res.ok) throw new Error('Failed to save trigger zone')
      await loadCameras()
      showToast('Trigger zone saved!', 'success')
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error')
      throw err
    } finally { setSaving(false) }
  }

  async function handleDeleteCamera(camera) {
    if (!window.confirm(`Delete camera "${camera.name || camera.camera_id}"?`)) return
    try {
      const res = await apiFetch(`${API_BASE}/api/cameras/${camera.camera_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete camera')
      if (selectedCamera?.camera_id === camera.camera_id) setSelectedCamera(null)
      await loadCameras()
      showToast('Camera deleted', 'info')
    } catch (err) { showToast('Failed to delete: ' + err.message, 'error') }
  }

  const openAdd = () => { setEditCamera(null); setShowModal(true) }
  const openEdit = (cam) => { setEditCamera(cam); setShowModal(true) }
  const handleModalSave = () => { loadCameras(); showToast(editCamera ? 'Camera updated!' : 'Camera added!', 'success') }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
        <span className="ml-3 text-content-secondary">Loading cameras...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="bg-danger-muted border-danger/30">
        <CardBody>
          <p className="text-danger-content">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadCameras} className="mt-3">Retry</Button>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {ToastEl}

      <PageHeader
        title="Camera Settings"
        description="Configure trigger zones and camera parameters"
        actions={
          <Button onClick={openAdd} icon={<Plus className="w-4 h-4" />}>Add Camera</Button>
        }
      />

      {cameras.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Camera className="w-8 h-8" />}
              title="No cameras configured"
              description="Add a camera to start configuring trigger zones."
              action={<Button onClick={openAdd} icon={<Plus className="w-4 h-4" />}>Add Camera</Button>}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Camera list */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-content">
                Cameras <span className="text-content-tertiary font-normal">({cameras.length})</span>
              </h3>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-border">
                {cameras.map((camera) => (
                  <div key={camera.camera_id}
                    className={`transition-colors ${selectedCamera?.camera_id === camera.camera_id ? 'bg-accent-muted border-l-4 border-accent' : 'hover:bg-surface-overlay'}`}>
                    <button onClick={() => setSelectedCamera(camera)} className="w-full text-left px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-content text-sm truncate">{camera.name || camera.camera_id}</p>
                          <p className="text-xs text-content-tertiary mt-0.5 truncate">{camera.camera_id}</p>
                        </div>
                        <Badge variant={camera.status === 'ONLINE' ? 'success' : 'default'} size="sm" dot>
                          {camera.status || 'OFFLINE'}
                        </Badge>
                      </div>
                      {camera.trigger_zone?.points && (
                        <p className="text-xs text-success mt-2 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Zone ({camera.trigger_zone.points.length} pts)
                        </p>
                      )}
                    </button>
                    <div className="px-4 pb-3 flex gap-2">
                      <Button variant="secondary" size="xs" className="flex-1"
                        onClick={(e) => { e.stopPropagation(); openEdit(camera) }}
                        icon={<Pencil className="w-3 h-3" />}>Edit</Button>
                      <Button variant="danger" size="xs" className="flex-1"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCamera(camera) }}
                        icon={<Trash2 className="w-3 h-3" />}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Trigger Zone Editor */}
          {selectedCamera ? (
            <TriggerZoneEditor camera={selectedCamera} onSave={handleSaveTriggerZone} />
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Video className="w-8 h-8" />}
                  title="Select a camera"
                  description="Choose a camera from the list to edit its trigger zone."
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <CameraModal open={showModal} onClose={() => setShowModal(false)} onSave={handleModalSave} editCamera={editCamera} />
    </div>
  )
}
