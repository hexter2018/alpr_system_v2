import React, { useState, useEffect, useRef } from 'react'
import { Stage, Layer, Line, Circle, Image as KonvaImage } from 'react-konva'
import { Button, Card, CardHeader, CardBody, Input, Badge, Spinner } from '../components/UIComponents.jsx'
import { API_BASE } from '../lib/api.js'

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
        .then(res => res.blob())
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
        .catch(err => console.error('Failed to load snapshot:', err))
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
              <div className="flex items-center justify-center h-96">
                <Spinner size="lg" className="text-blue-500" />
                <span className="ml-3 text-slate-400">Loading camera snapshot...</span>
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
        body: JSON.stringify({ points, zone_type: 'polygon' })
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
          <h1 className="text-2xl font-bold text-slate-100">Camera Settings</h1>
          <p className="text-sm text-slate-300 mt-1">
            Configure trigger zones and camera parameters
          </p>
        </CardBody>
      </Card>

      {cameras.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-slate-400">No cameras configured yet.</p>
              <p className="text-sm text-slate-500 mt-2">Add a camera to get started.</p>
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
                  <button
                    key={camera.camera_id}
                    onClick={() => setSelectedCamera(camera)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedCamera?.camera_id === camera.camera_id
                        ? 'bg-blue-500/20 border-l-4 border-blue-400'
                        : 'hover:bg-slate-800/50'
                    }`}
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
    </div>
  )
}