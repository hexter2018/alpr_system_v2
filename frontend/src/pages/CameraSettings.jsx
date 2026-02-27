import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Line, Circle, Image as KonvaImage } from 'react-konva'
import { Button, Card, CardHeader, CardBody, Input, Badge, Spinner } from '../components/UIComponents.jsx'
import { API_BASE } from '../lib/api.js'

/* ===== TOAST ===== */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])
  const colors = {
    success: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200',
    error:   'bg-rose-500/20 border-rose-400/40 text-rose-200',
    info:    'bg-blue-500/20 border-blue-400/40 text-blue-200',
  }
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm ${colors[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">✕</button>
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
      const url = isEdit ? `${API_BASE}/api/cameras/${editCamera.camera_id}` : `${API_BASE}/api/cameras`
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
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-300/40 rounded-lg text-rose-200 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Camera ID *" value={formData.camera_id}
              onChange={e => setFormData({ ...formData, camera_id: e.target.value })}
              placeholder="cam-001" required disabled={isEdit}
              hint={isEdit ? 'Camera ID cannot be changed' : 'Unique identifier'} />
            <Input label="Camera Name *" value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Main Entrance" required />
            <Input label="RTSP URL" value={formData.rtsp_url}
              onChange={e => setFormData({ ...formData, rtsp_url: e.target.value })}
              placeholder="rtsp://user:pass@192.168.1.100:554/stream"
              hint="RTSP stream URL for live monitoring" />
            <Input label="FPS" type="number" step="0.1" min="0.5" max="30"
              value={formData.fps}
              onChange={e => setFormData({ ...formData, fps: parseFloat(e.target.value) })}
              hint="Frames per second for processing" />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={formData.enabled}
                onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded border-slate-600 bg-slate-900/50 text-blue-500 focus:ring-blue-500" />
              <span>Enable camera</span>
            </label>
            <div className="flex gap-3 pt-4">
              <Button type="submit" variant="primary"
                disabled={saving || !formData.camera_id || !formData.name} className="flex-1">
                {saving
                  ? <><Spinner size="sm" className="mr-2" />{isEdit ? 'Saving...' : 'Creating...'}</>
                  : isEdit ? 'Save Changes' : 'Add Camera'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ===== TRIGGER ZONE EDITOR =====
 *
 *  FIX 1 — Live streaming
 *    ─ ลอง MJPEG endpoint (GET /api/cameras/{id}/stream) ก่อน
 *    ─ ถ้าไม่มี → fallback polling snapshot ทุก 2 วินาที
 *    ─ ใช้ <img> tag ธรรมดาสำหรับ MJPEG (browser handle multipart/x-mixed-replace)
 *    ─ Konva overlay วางซ้อนบน <img> สำหรับวาด zone
 *
 *  FIX 2 — Coordinate normalization (สาเหตุหลักที่ capture ใน zone ไม่ทำงาน)
 *    ─ บันทึก points เป็น normalized [0-1] (สัดส่วนของ display canvas)
 *    ─ Backend ต้อง multiply ด้วย frame resolution จริงก่อนใช้ใน detection
 *    ─ เมื่อ load trigger zone กลับมา → denormalize เป็น display pixels
 *
 *  ⚠️  BACKEND REQUIREMENT:
 *    1. /api/cameras/{id}/stream → MJPEG stream (optional แต่แนะนำ)
 *    2. trigger-zone points ที่ backend รับ → ต้องแปลง normalized→pixel
 *       ก่อนใช้ใน polygon check:
 *         real_x = norm_x * frame_width
 *         real_y = norm_y * frame_height
 */

const DISPLAY_W = 800
const DISPLAY_H = 600

function TriggerZoneEditor({ camera, onSave }) {
  const [points, setPoints] = useState([])         // display pixel coords
  const [isDrawing, setIsDrawing] = useState(false)
  const [imageObj, setImageObj] = useState(null)   // for polling mode
  const [dimensions, setDimensions] = useState({ width: DISPLAY_W, height: DISPLAY_H })
  const [loading, setLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState(null)
  const [streamMode, setStreamMode] = useState('idle') // 'idle'|'mjpeg'|'polling'|'error'
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const stageRef = useRef(null)
  const blobUrlRef = useRef(null)
  const pollTimerRef = useRef(null)

  // ── Snapshot loader (used for polling fallback) ───────────────────────────
  const loadSnapshot = useCallback(() => {
    if (!camera?.camera_id) return

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    fetch(`${API_BASE}/api/cameras/${camera.camera_id}/snapshot`)
      .then(res => {
        if (!res.ok) {
          const err = new Error(
            res.status === 404
              ? 'No snapshot available'
              : `Server error ${res.status}`
          )
          err.status = res.status
          throw err
        }
        return res.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        const img = new window.Image()
        img.onload = () => {
          const scale = Math.min(DISPLAY_W / img.naturalWidth, DISPLAY_H / img.naturalHeight, 1)
          setDimensions({
            width: Math.round(img.naturalWidth * scale),
            height: Math.round(img.naturalHeight * scale)
          })
          setImageObj(img)
          setLoading(false)
          setSnapshotError(null)
        }
        img.onerror = () => {
          setSnapshotError('Failed to decode snapshot')
          setLoading(false)
        }
        img.src = url
      })
      .catch(err => {
        if (err?.status === 404 && pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
        setSnapshotError(err.message)
        setLoading(false)
      })
  }, [camera?.camera_id])

  // ── Start stream: try MJPEG first, fallback to polling ───────────────────
  const stopStream = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setStreamMode('idle')
  }, [])

  const startStream = useCallback(() => {
    if (!camera?.camera_id) return
    stopStream()
    setLoading(true)
    setSnapshotError(null)

    const mjpegUrl = `${API_BASE}/api/cameras/${camera.camera_id}/stream`
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 3000)

    fetch(mjpegUrl, { method: 'HEAD', signal: ctrl.signal })
      .then(res => {
        clearTimeout(timeout)
        if (res.ok || res.status === 200) {
          // MJPEG available
          setStreamMode('mjpeg')
          setLoading(false)
        } else {
          throw new Error('no stream endpoint')
        }
      })
      .catch(() => {
        clearTimeout(timeout)
        // Fallback: polling snapshot every 2 seconds
        setStreamMode('polling')
        loadSnapshot()
        pollTimerRef.current = setInterval(loadSnapshot, 2000)
      })
  }, [camera?.camera_id, loadSnapshot, stopStream])

  // ── Effect: restart stream when camera changes ────────────────────────────
  useEffect(() => {
    if (!camera?.camera_id) {
      stopStream()
      setImageObj(null)
      setPoints([])
      return
    }
    startStream()
    return () => {
      stopStream()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [camera?.camera_id]) // eslint-disable-line

  // ── Load existing trigger zone — denormalize to display px ───────────────
  useEffect(() => {
    if (camera?.trigger_zone?.points?.length > 0) {
      const pts = camera.trigger_zone.points
      // Detect normalized [0-1] vs legacy pixel coords
      const isNorm = pts.every(([x, y]) => x <= 1.0 && y <= 1.0)
      if (isNorm) {
        setPoints(pts.map(([x, y]) => ({
          x: x * dimensions.width,
          y: y * dimensions.height
        })))
      } else {
        setPoints(pts.map(([x, y]) => ({ x, y })))
      }
    } else {
      setPoints([])
    }
    setSaveSuccess(false)
  }, [camera?.camera_id]) // eslint-disable-line

  // ── MJPEG img handlers ────────────────────────────────────────────────────
  const handleMjpegLoad = (e) => {
    const img = e.target
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    if (nw && nh) {
      const scale = Math.min(DISPLAY_W / nw, DISPLAY_H / nh, 1)
      setDimensions({ width: Math.round(nw * scale), height: Math.round(nh * scale) })
    }
    setLoading(false)
  }

  const handleMjpegError = () => {
    // MJPEG broken — fallback to polling
    setStreamMode('polling')
    loadSnapshot()
    if (!pollTimerRef.current) {
      pollTimerRef.current = setInterval(loadSnapshot, 2000)
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  const handleStageClick = (e) => {
    if (!isDrawing) return
    const pos = e.target.getStage().getPointerPosition()
    setPoints(prev => [...prev, { x: pos.x, y: pos.y }])
  }

  const handlePointDragMove = (index, e) => {
    const newPoints = [...points]
    newPoints[index] = { x: e.target.x(), y: e.target.y() }
    setPoints(newPoints)
  }

  // ── Save — store as normalized [0-1] ─────────────────────────────────────
  const handleSave = async () => {
    const normalizedPoints = points.map(p => [
      parseFloat((p.x / dimensions.width).toFixed(6)),
      parseFloat((p.y / dimensions.height).toFixed(6))
    ])
    setSaving(true)
    setSaveSuccess(false)
    try {
      await onSave(normalizedPoints)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      // error handled by parent
    } finally {
      setSaving(false)
    }
  }

  const flatPoints = points.flatMap(p => [p.x, p.y])
  const isMjpeg = streamMode === 'mjpeg'
  const mjpegUrl = `${API_BASE}/api/cameras/${camera?.camera_id}/stream`

  // ── Render ────────────────────────────────────────────────────────────────
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
            {streamMode === 'mjpeg' && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-xs text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Live Stream
              </span>
            )}
            {streamMode === 'polling' && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-xs text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                Snapshot (2s)
              </span>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

            <Button variant="secondary" onClick={() => { setPoints([]); setIsDrawing(false) }} disabled={points.length === 0}>
              Clear
            </Button>

            <Button
              variant={saveSuccess ? 'success' : 'primary'}
              onClick={handleSave}
              disabled={points.length < 3 || isDrawing || saving}
            >
              {saving
                ? <><Spinner size="sm" className="mr-2" />Saving...</>
                : saveSuccess ? '✓ Saved!'
                : 'Save Zone'}
            </Button>

            {/* Refresh / retry */}
            <button
              onClick={startStream}
              disabled={loading}
              title="Refresh stream"
              className="ml-auto p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Hints */}
          <div className="text-sm min-h-[1.25rem]">
            {isDrawing && <p className="text-emerald-400">✓ Click on the image to add points. Need ≥3 to finish.</p>}
            {!isDrawing && points.length > 0 && !saveSuccess && <p className="text-blue-400">✓ Drag points to fine-tune, then "Save Zone".</p>}
            {saveSuccess && <p className="text-emerald-400">✓ Trigger zone saved successfully!</p>}
            {!isDrawing && points.length === 0 && <p className="text-slate-400">Click "Start Drawing" then click on the image to define the polygon.</p>}
          </div>

          {/* Canvas area */}
          <div className="border border-blue-300/20 rounded-xl overflow-hidden bg-slate-950/40 relative">

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center h-96">
                <Spinner size="lg" className="text-blue-500" />
                <span className="ml-3 text-slate-400">Connecting to stream...</span>
              </div>
            )}

            {/* No data state */}
            {!loading && !isMjpeg && !imageObj && (
              <div className="flex flex-col items-center justify-center h-96 p-8 text-center">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-slate-300 font-semibold mb-2">No Stream Available</p>
                {snapshotError
                  ? <p className="text-sm text-slate-400 max-w-md">{snapshotError}</p>
                  : <p className="text-sm text-slate-400 max-w-md">
                      Upload an image for <code className="text-blue-300">{camera?.camera_id}</code> or wait for the RTSP stream to connect.
                    </p>
                }
                <button onClick={startStream}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors">
                  🔄 Try Again
                </button>
              </div>
            )}

            {/* ── MJPEG mode: <img> + Konva overlay ── */}
            {isMjpeg && (
              <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
                {/* Browser streams MJPEG natively via multipart/x-mixed-replace */}
                <img
                  src={mjpegUrl}
                  onLoad={handleMjpegLoad}
                  onError={handleMjpegError}
                  style={{ width: dimensions.width, height: dimensions.height, display: 'block', objectFit: 'contain' }}
                  alt="Live MJPEG stream"
                />
                {/* Transparent Konva canvas for drawing zone on top of video */}
                <div className="absolute inset-0 pointer-events-auto">
                  <Stage
                    width={dimensions.width}
                    height={dimensions.height}
                    onClick={handleStageClick}
                    ref={stageRef}
                    style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
                  >
                    <Layer>
                      {points.length > 0 && (
                        <Line
                          points={flatPoints}
                          stroke="#10b981"
                          strokeWidth={3}
                          closed={!isDrawing && points.length >= 3}
                          fill={!isDrawing && points.length >= 3 ? 'rgba(16,185,129,0.18)' : undefined}
                        />
                      )}
                      {points.map((pt, i) => (
                        <Circle key={i} x={pt.x} y={pt.y} radius={8}
                          fill="#10b981" stroke="#fff" strokeWidth={2}
                          draggable={!isDrawing}
                          onDragMove={e => handlePointDragMove(i, e)} />
                      ))}
                    </Layer>
                  </Stage>
                </div>
              </div>
            )}

            {/* ── Polling / static snapshot mode: Konva with KonvaImage ── */}
            {!isMjpeg && imageObj && !loading && (
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
                      fill={!isDrawing && points.length >= 3 ? 'rgba(16,185,129,0.18)' : undefined}
                    />
                  )}
                  {points.map((pt, i) => (
                    <Circle key={i} x={pt.x} y={pt.y} radius={8}
                      fill="#10b981" stroke="#fff" strokeWidth={2}
                      draggable={!isDrawing}
                      onDragMove={e => handlePointDragMove(i, e)} />
                  ))}
                </Layer>
              </Stage>
            )}
          </div>

          {/* Coordinate info note */}
          {points.length > 0 && (
            <p className="text-xs text-slate-500">
              ⚠️ Points stored as normalized (0–1) coordinates. Backend must scale by actual frame resolution when checking zone.
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
        const updated = data.find(c => c.camera_id === selectedCamera.camera_id)
        if (updated) setSelectedCamera(updated)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveTriggerZone(normalizedPoints) {
    if (!selectedCamera) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCamera.camera_id}/trigger-zone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_zone: { points: normalizedPoints, zone_type: 'polygon' } })
      })
      if (!res.ok) throw new Error('Failed to save trigger zone')
      await loadCameras()
      showToast('Trigger zone saved!', 'success')
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCamera(camera) {
    if (!window.confirm(`Delete camera "${camera.name || camera.camera_id}"?`)) return
    try {
      const res = await fetch(`${API_BASE}/api/cameras/${camera.camera_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete camera')
      if (selectedCamera?.camera_id === camera.camera_id) setSelectedCamera(null)
      await loadCameras()
      showToast('Camera deleted', 'info')
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error')
    }
  }

  const openAdd = () => { setEditCamera(null); setShowModal(true) }
  const openEdit = (cam) => { setEditCamera(cam); setShowModal(true) }
  const handleModalSave = () => {
    loadCameras()
    showToast(editCamera ? 'Camera updated!' : 'Camera added!', 'success')
  }

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
              <p className="text-sm text-slate-300 mt-1">Configure trigger zones and camera parameters</p>
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
              <p className="text-slate-400 mb-4">No cameras configured yet.</p>
              <Button variant="primary" onClick={openAdd}>Add a camera to get started</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Camera list */}
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
                    <button onClick={() => setSelectedCamera(camera)} className="w-full text-left px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-100 text-sm truncate">
                            {camera.name || camera.camera_id}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">{camera.camera_id}</div>
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
                        <div className="text-xs text-slate-500 mt-1 truncate">🔗 {camera.rtsp_url}</div>
                      )}
                    </button>
                    <div className="px-4 pb-3 flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(camera) }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteCamera(camera) }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 text-xs transition-colors"
                      >
                        🗑 Delete
                      </button>
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
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="text-4xl mb-3">👈</div>
                  <p className="text-slate-400 text-sm">Select a camera to edit its trigger zone</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <CameraModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleModalSave}
        editCamera={editCamera}
      />
    </div>
  )
}