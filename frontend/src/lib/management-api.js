// frontend/src/lib/management-api.js
// API client functions for Management & Operations layer

import { API_BASE, apiFetch } from './api.js'

// ======================
// Camera Management
// ======================

export async function listCameras() {
  const res = await apiFetch(`${API_BASE}/api/cameras`)
  if (!res.ok) throw new Error('Failed to load cameras')
  return res.json()
}

export async function getCamera(cameraId) {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}`)
  if (!res.ok) throw new Error('Failed to load camera')
  return res.json()
}

export async function createCamera(data) {
  const res = await apiFetch(`${API_BASE}/api/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to create camera')
  return res.json()
}

export async function updateCamera(cameraId, data) {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update camera')
  return res.json()
}

export async function updateTriggerZone(cameraId, points, zoneType = 'polygon') {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}/trigger-zone`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, zone_type: zoneType })
  })
  if (!res.ok) throw new Error('Failed to update trigger zone')
  return res.json()
}

export async function updateCameraStatus(cameraId, fps) {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fps })
  })
  if (!res.ok) throw new Error('Failed to update camera status')
  return res.json()
}

export async function deleteCamera(cameraId) {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete camera')
  return res.json()
}

export async function getCameraSnapshot(cameraId) {
  const res = await apiFetch(`${API_BASE}/api/cameras/${cameraId}/snapshot`)
  if (!res.ok) throw new Error('Failed to get camera snapshot')
  return res.blob()
}

// ======================
// Health Monitoring
// ======================

export async function getSystemHealth() {
  const res = await apiFetch(`${API_BASE}/api/health/system`)
  if (!res.ok) throw new Error('Failed to load system health')
  return res.json()
}

export async function getCameraHealth() {
  const res = await apiFetch(`${API_BASE}/api/health/cameras`)
  if (!res.ok) throw new Error('Failed to load camera health')
  return res.json()
}

export async function getWorkerHealth() {
  const res = await apiFetch(`${API_BASE}/api/health/workers`)
  if (!res.ok) throw new Error('Failed to load worker health')
  return res.json()
}

export async function getHealthMetrics(hours = 1, metricType = null, metricName = null) {
  const params = new URLSearchParams({ hours: hours.toString() })
  if (metricType) params.append('metric_type', metricType)
  if (metricName) params.append('metric_name', metricName)
  
  const res = await apiFetch(`${API_BASE}/api/health/metrics?${params}`)
  if (!res.ok) throw new Error('Failed to load metrics')
  return res.json()
}

export async function recordHeartbeat(cameraId, fps) {
  const res = await apiFetch(`${API_BASE}/api/health/heartbeat/${cameraId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fps })
  })
  if (!res.ok) throw new Error('Failed to record heartbeat')
  return res.json()
}

export async function recordMetric(metricType, metricName, value, metadata = null) {
  const res = await apiFetch(`${API_BASE}/api/health/metric`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metric_type: metricType, metric_name: metricName, value, metadata })
  })
  if (!res.ok) throw new Error('Failed to record metric')
  return res.json()
}

// ======================
// Watchlist Management
// ======================

export async function listWatchlist(filters = {}) {
  const params = new URLSearchParams()
  if (filters.list_type) params.append('list_type', filters.list_type)
  if (filters.active !== undefined) params.append('active', filters.active)
  if (filters.search) params.append('search', filters.search)
  
  const res = await apiFetch(`${API_BASE}/api/watchlist?${params}`)
  if (!res.ok) throw new Error('Failed to load watchlist')
  return res.json()
}

export async function getWatchlistEntry(id) {
  const res = await apiFetch(`${API_BASE}/api/watchlist/${id}`)
  if (!res.ok) throw new Error('Failed to load watchlist entry')
  return res.json()
}

export async function addToWatchlist(data) {
  const res = await apiFetch(`${API_BASE}/api/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to add to watchlist')
  return res.json()
}

export async function updateWatchlistEntry(id, data) {
  const res = await apiFetch(`${API_BASE}/api/watchlist/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update watchlist entry')
  return res.json()
}

export async function deleteWatchlistEntry(id) {
  const res = await apiFetch(`${API_BASE}/api/watchlist/${id}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete watchlist entry')
  return res.json()
}

export async function listAlerts(filters = {}) {
  const params = new URLSearchParams()
  if (filters.acknowledged !== undefined) params.append('acknowledged', filters.acknowledged)
  if (filters.camera_id) params.append('camera_id', filters.camera_id)
  if (filters.alert_level) params.append('alert_level', filters.alert_level)
  
  const res = await apiFetch(`${API_BASE}/api/alerts?${params}`)  // ✅ ถูกต้อง
  if (!res.ok) throw new Error('Failed to load alerts')
  return res.json()
}

export async function acknowledgeAlert(alertId, userId = 'user') {
  const res = await apiFetch(`${API_BASE}/api/alerts/${alertId}/acknowledge?acknowledged_by=${userId}`, {  // ✅ ถูกต้อง
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!res.ok) throw new Error('Failed to acknowledge alert')
  return res.json()
}

// ======================
// Advanced Search
// ======================

export async function searchPlates(filters = {}) {
  const params = new URLSearchParams()
  if (filters.q) params.append('q', filters.q)
  if (filters.camera_id) params.append('camera_id', filters.camera_id)
  if (filters.province) params.append('province', filters.province)
  if (filters.start_date) params.append('start_date', filters.start_date)
  if (filters.end_date) params.append('end_date', filters.end_date)
  if (filters.min_confidence) params.append('min_confidence', filters.min_confidence)
  if (filters.status) params.append('status', filters.status)
  if (filters.watchlist_only !== undefined) params.append('watchlist_only', filters.watchlist_only)
  if (filters.limit) params.append('limit', filters.limit)
  if (filters.offset) params.append('offset', filters.offset)
  
  const res = await apiFetch(`${API_BASE}/api/search/plates?${params}`)
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

export async function getEvidence(readId) {
  const res = await apiFetch(`${API_BASE}/api/search/evidence/${readId}`)
  if (!res.ok) throw new Error('Failed to load evidence')
  return res.json()
}

// ======================
// Utility Functions
// ======================

export function formatDateTime(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function getAlertLevelColor(level) {
  const colors = {
    HIGH: 'rose',
    MEDIUM: 'amber',
    LOW: 'blue'
  }
  return colors[level] || 'default'
}

export function getCameraStatusColor(status) {
  return status === 'ONLINE' ? 'success' : 'default'
}
