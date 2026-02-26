import React, { useState, useEffect, useRef } from 'react'
import { Stage, Layer, Line, Circle, Image as KonvaImage } from 'react-konva'
import { Button, Card, CardHeader, CardBody, Input, Badge, Spinner } from '../components/UIComponents.jsx'
import { API_BASE } from '../lib/api.js'

/* ===== ADD CAMERA MODAL ===== */
function AddCameraModal({ open, onClose, onSave }) {
  const [formData, setFormData] = useState({
    camera_id: '',
    name: '',
    rtsp_url: '',
    enabled: true,
    fps: 2.0
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Failed to create camera')
      }

      onSave()
      onClose()
      // Reset form
      setFormData({
        camera_id: '',
        name: '',
        rtsp_url: '',
        enabled: true,
        fps: 2.0
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-100">Add New Camera</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
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
              hint="Unique identifier for this camera"
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
              hint="Optional - RTSP stream URL for live monitoring"
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

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
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
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Creating...
                  </>
                ) : (
                  'Add Camera'
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

/* ===== VISUAL TRIGGER ZONE EDITOR ===== */
function TriggerZoneEditor({ camera, onSave }) {
  const [points, setPoints] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [snapshot, setSnapshot] = useState(null)
  const [imageObj, setImageObj] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const stageRef = useRef(null)

  // Load camera snapshot
  useEffect(() => {
    if (camera && camera.camera_id) {
      fetch(`${API_BASE}/api/cameras/${camera.camera_id}/snapshot`)
        .then(res => {
          if (!res.ok) {
            throw new Error('No snapshot available - please capture an image first')
          }
          return res.blob()
        })
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const img = new window.Image()
          img.onload = () => {
            setImageObj(img)
            // Scale to fit editor
            const maxWidth = 800
            const maxHeight = 600
            const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1)
            setDimensions({
              width: img.width * scale,
              height: img.height * scale
            })
          }
          img.src = url
          setSnapshot(url)
        })
        .catch(err => {
          console.error('Failed to load snapshot:', err)
          // Set a placeholder or show error message
          setImageObj(null)
        })
    }
  }, [camera])

  // Load existing trigger zone
  useEffect(() => {
    if (camera?.trigger_zone?.points) {
      setPoints(camera.trigger_zone.points.map(([x, y]) => ({ x, y })))
    }
  }, [camera])

  const handleStageClick = (e) => {
    if (!isDrawing) return

    const stage = e.target.getStage()
    const pointer = stage.getPointerPosition()
    
    // Add new point
    setPoints([...points, { x: pointer.x, y: pointer.y }])
  }

  const handlePointDragMove = (index, e) => {
    const newPoints = [...points]
    newPoints[index] = {
      x: e.target.x(),
      y: e.target.y()
    }
    setPoints(newPoints)
  }

  const handleSave = async () => {
    // Convert to backend format: array of [x, y] pairs
    const normalizedPoints = points.map(p => [p.x, p.y])
    
    try {
      await onSave(normalizedPoints)
    } catch (err) {
      alert('Failed to save trigger zone: ' + err.message)
    }
  }

  const handleClear = () => {
    setPoints([])
  }

  const handleStartDrawing = () => {
    setIsDrawing(true)
    setPoints([])
  }

  const handleStopDrawing = () => {
    setIsDrawing(false)
  }

  // Convert points to flat array for Konva Line
  const flatPoints = points.flatMap(p => [p.x, p.y])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Trigger Zone Editor</h3>
            <p className="text-xs text-slate-400 mt-1">
              Define the zone where vehicle detection triggers OCR processing
            </p>
          </div>
          <Badge variant={isDrawing ? "success" : "default"}>
            {isDrawing ? `Drawing (${points.length} points)` : `${points.length} points`}
          </Badge>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex gap-2 flex-wrap">
            {!isDrawing ? (
              <Button variant="primary" onClick={handleStartDrawing}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Start Drawing
              </Button>
            ) : (
              <Button variant="success" onClick={handleStopDrawing}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Finish Drawing
              </Button>
            )}
            
            <Button variant="secondary" onClick={handleClear} disabled={points.length === 0}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Clear
            </Button>

            <Button 
              variant="primary" 
              onClick={handleSave} 
              disabled={points.length < 3}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
              </svg>
              Save Trigger Zone
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-sm text-slate-400 space-y-1">
            {isDrawing && (
              <p className="text-emerald-400">
                ✓ Click on the image to add points. Click "Finish Drawing" when done (minimum 3 points).
              </p>
            )}
            {!isDrawing && points.length > 0 && (
              <p className="text-blue-400">
                ✓ Drag the points to adjust the zone. Click "Save Trigger Zone" to apply changes.
              </p>
            )}
            {!isDrawing && points.length === 0 && (
              <p>
                Click "Start Drawing" and then click on the camera view to define the trigger zone polygon.
              </p>
            )}
          </div>

          {/* Canvas */}
          <div className="border border-blue-300/20 rounded-xl overflow-hidden bg-slate-950/40">
            {!imageObj ? (
              <div className="flex flex-col items-center justify-center h-96">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-slate-400 mb-2">No snapshot available</p>
                <p className="text-sm text-slate-500">
                  Upload an image or start streaming to configure trigger zone
                </p>
              </div>
            ) : (
              <Stage
                width={dimensions.width}
                height={dimensions.height}
                onClick={handleStageClick}
                ref={stageRef}
              >
                <Layer>
                  {/* Camera snapshot */}
                  <KonvaImage
                    image={imageObj}
                    width={dimensions.width}
                    height={dimensions.height}
                  />

                  {/* Polygon */}
                  {points.length > 0 && (
                    <Line
                      points={flatPoints}
                      stroke="#10b981"
                      strokeWidth={3}
                      closed={!isDrawing && points.length >= 3}
                      fill={!isDrawing && points.length >= 3 ? "rgba(16, 185, 129, 0.2)" : undefined}
                    />
                  )}

                  {/* Control points */}
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
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadCameras()
  }, [])

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

      // Reload cameras to get updated data
      await loadCameras()
      alert('Trigger zone saved successfully!')
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddCamera = () => {
    setShowAddModal(true)
  }

  const handleAddModalClose = () => {
    setShowAddModal(false)
  }

  const handleAddModalSave = () => {
    loadCameras()
  }

  const handleDeleteCamera = async (camera) => {
    if (!confirm(`Are you sure you want to delete camera "${camera.name || camera.camera_id}"?`)) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${camera.camera_id}`, {
        method: 'DELETE'
      })

      if (!res.ok) throw new Error('Failed to delete camera')

      // If deleted camera was selected, clear selection
      if (selectedCamera?.camera_id === camera.camera_id) {
        setSelectedCamera(null)
      }

      await loadCameras()
      alert('Camera deleted successfully')
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
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
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
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
            <Button variant="primary" onClick={handleAddCamera}>
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
              <Button variant="primary" onClick={handleAddCamera}>
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
              <h3 className="text-sm font-semibold text-slate-100">Cameras</h3>
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
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-slate-100 text-sm">
                            {camera.name || camera.camera_id}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
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
                    </button>
                    
                    {/* Delete Button */}
                    <div className="px-4 pb-3">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteCamera(camera)
                        }}
                        className="w-full"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Delete Camera
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Trigger Zone Editor */}
          {selectedCamera && (
            <TriggerZoneEditor
              camera={selectedCamera}
              onSave={handleSaveTriggerZone}
            />
          )}
        </div>
      )}

      {/* Add Camera Modal */}
      <AddCameraModal
        open={showAddModal}
        onClose={handleAddModalClose}
        onSave={handleAddModalSave}
      />
    </div>
  )
}