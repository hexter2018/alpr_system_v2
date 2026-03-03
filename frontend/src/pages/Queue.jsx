import React, { useCallback, useEffect, useState, useRef } from 'react'
import { absImageUrl, deleteRead, listPending, verifyRead } from '../lib/api.js'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Input,
  Badge,
  ConfidenceBadge,
  Toast,
  Modal,
  EmptyState,
  Spinner,
  SkeletonCard,
} from '../components/UIComponents.jsx'
import { RefreshCw, ListChecks } from 'lucide-react'

/* ===== PROVINCES DATA ===== */
const POPULAR_PROVINCES = [
  { value: 'กรุงเทพมหานคร', label: 'กทม' },
  { value: 'สมุทรปราการ', label: 'ปราการ' },
  { value: 'สมุทรสาคร', label: 'สาคร' },
  { value: 'นนทบุรี', label: 'นนท์' },
  { value: 'ปทุมธานี', label: 'ปทุม' },
  { value: 'ชลบุรี', label: 'ชล' },
]

/* ===== CONFUSABLE CHARACTER FIXES ===== */
const CONFUSION_FIXES = {
  high: [
    { from: 'ข', to: 'ฆ', tooltip: 'ข เป็น ฆ (สับสนบ่อย)' },
    { from: 'ฆ', to: 'ข', tooltip: 'ฆ เป็น ข (สับสนบ่อย)' },
    { from: 'ข', to: 'ม', tooltip: 'ข เป็น ม (สับสนบ่อย)' },
    { from: 'ม', to: 'ข', tooltip: 'ม เป็น ข (สับสนบ่อย)' },
  ],
  medium: [
    { from: 'ค', to: 'ฅ', tooltip: 'ค เป็น ฅ' },
    { from: 'ถ', to: 'ค', tooltip: 'ถ เป็น ค' },
    { from: 'ศ', to: 'ส', tooltip: 'ศ เป็น ส' },
    { from: 'ผ', to: 'พ', tooltip: 'ผ เป็น พ' },
    { from: 'พ', to: 'ผ', tooltip: 'พ เป็น ผ' },
    { from: 'บ', to: 'ป', tooltip: 'บ เป็น ป' },
    { from: 'ป', to: 'บ', tooltip: 'ป เป็น บ' },
  ],
}

/* ===== TOAST CONTAINER ===== */
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}

/* ===== IMAGE VIEWER MODAL ===== */
function ImageViewer({ open, src, title, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragState = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
  })

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=')
        setScale((s) => Math.min(4, s + 0.2))
      if (e.key === '-') setScale((s) => Math.max(0.5, s - 0.2))
      if (e.key === '0') {
        setScale(1)
        setPosition({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [open, src])

  if (!open) return null

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY * -0.001
    setScale((s) => Math.min(4, Math.max(0.5, s + delta)))
  }

  const handleMouseDown = (e) => {
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      x: position.x,
      y: position.y,
    }
  }

  const handleMouseMove = (e) => {
    if (!dragState.current.dragging) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPosition({
      x: dragState.current.x + dx,
      y: dragState.current.y + dy,
    })
  }

  const handleMouseUp = () => {
    dragState.current.dragging = false
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3 bg-slate-950/80">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Zoom: {(scale * 100).toFixed(0)}% | Scroll to zoom, drag to pan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            -
          </Button>
          <span className="text-xs text-slate-400 tabular-nums w-10 text-center">
            {(scale * 100).toFixed(0)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale((s) => Math.min(4, s + 0.2))}
          >
            +
          </Button>
          <div className="w-px h-5 bg-white/[0.1] mx-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-hidden" onWheel={handleWheel}>
        <div className="flex h-full w-full items-center justify-center p-8">
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full select-none rounded-lg"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: dragState.current.dragging ? 'grabbing' : 'grab',
              transition: dragState.current.dragging
                ? 'none'
                : 'transform 0.1s ease-out',
            }}
            onMouseDown={handleMouseDown}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}

/* ===== DELETE CONFIRMATION MODAL ===== */
function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  plate,
  province,
  confidence,
}) {
  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="Confirm Delete" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          This will permanently remove this item from the verification queue.
        </p>

        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Plate</span>
            <span className="font-mono font-medium text-white">
              {plate || '-'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Province</span>
            <span className="text-white">{province || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Confidence</span>
            <span className="text-white">{confidence}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===== VERIFICATION ITEM ===== */
function VerificationItem({
  item,
  busy,
  onConfirm,
  onCorrect,
  onDelete,
  onToast,
}) {
  const [plateText, setPlateText] = useState(item.plate_text || '')
  const [province, setProvince] = useState(item.province || '')
  const [note, setNote] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSrc, setViewerSrc] = useState('')
  const [viewerTitle, setViewerTitle] = useState('')
  const [lastChange, setLastChange] = useState(null)
  const [highlightField, setHighlightField] = useState(null)

  const provinceMissing = !province.trim()

  useEffect(() => {
    if (!highlightField) return
    const timer = setTimeout(() => setHighlightField(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightField])

  const handleKeyDown = useCallback(
    (e) => {
      if (busy) return
      const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)

      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        onCorrect(plateText, province, note)
      } else if (e.key === 'Enter' && !e.ctrlKey && !isTyping) {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Delete' && !isTyping) {
        e.preventDefault()
        setDeleteOpen(true)
      } else if ((e.key === 'n' || e.key === 'N') && !isTyping) {
        e.preventDefault()
        handleNormalize()
      }
    },
    [busy, plateText, province, note, onConfirm, onCorrect]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const applyFix = (from, to) => {
    const next = plateText.replace(new RegExp(from, 'g'), to)
    setLastChange({ field: 'plate', from, to, prev: plateText })
    setPlateText(next)
    setHighlightField('plate')
    onToast?.(`${from} -> ${to}`, 'info')
  }

  const handleNormalize = () => {
    const normalized = plateText
      .trim()
      .replace(/[\s\-.]/g, '')
      .replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))
      .toUpperCase()
    setLastChange({ field: 'plate', prev: plateText })
    setPlateText(normalized)
    setHighlightField('plate')
    onToast?.('Normalized plate text', 'info')
  }

  const handleUndo = () => {
    if (!lastChange) return
    if (lastChange.field === 'plate') {
      setPlateText(lastChange.prev)
      setHighlightField('plate')
    }
    setLastChange(null)
  }

  const openViewer = (src, title) => {
    setViewerSrc(src)
    setViewerTitle(title)
    setViewerOpen(true)
  }

  return (
    <>
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[560px_minmax(0,1fr)]">
            {/* Left: Image Evidence */}
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">
                Image Evidence
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Original */}
                <div
                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/[0.08] hover:border-white/[0.16] transition-colors"
                  onClick={() =>
                    openViewer(absImageUrl(item.original_url), 'Original')
                  }
                >
                  <img
                    src={absImageUrl(item.original_url)}
                    alt="Original"
                    className="w-full h-40 object-contain bg-slate-950"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-medium">
                      View Full
                    </span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 px-2 py-1">
                    <span className="text-[10px] text-slate-400">Original</span>
                  </div>
                </div>

                {/* Crop */}
                <div
                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/[0.08] hover:border-white/[0.16] transition-colors"
                  onClick={() =>
                    openViewer(absImageUrl(item.crop_url), 'Cropped Plate')
                  }
                >
                  <img
                    src={absImageUrl(item.crop_url)}
                    alt="Cropped Plate"
                    className="w-full h-40 object-contain bg-slate-950"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-medium">
                      View Full
                    </span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 px-2 py-1">
                    <span className="text-[10px] text-slate-400">Crop</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div className="flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    OCR Result
                  </h3>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Enter = Confirm | Ctrl+Enter = Save Edit | N = Normalize |
                    Del = Delete
                  </p>
                </div>
                <ConfidenceBadge score={item.confidence || 0} />
              </div>

              {/* Plate Input */}
              <div className="space-y-4 flex-1">
                <Input
                  label="Plate Number"
                  value={plateText}
                  onChange={(e) => setPlateText(e.target.value)}
                  placeholder="Enter plate text"
                  className={`text-lg font-semibold font-mono tracking-wider ${
                    highlightField === 'plate'
                      ? 'ring-1 ring-blue-500'
                      : ''
                  }`}
                />

                {/* Quick Fix Buttons */}
                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Common Confusion
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CONFUSION_FIXES.high.map((fix) => (
                        <button
                          key={`${fix.from}-${fix.to}`}
                          type="button"
                          title={fix.tooltip}
                          onClick={() => applyFix(fix.from, fix.to)}
                          className="px-2 py-1 text-xs font-medium rounded-md border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                        >
                          {fix.from}
                          {' -> '}
                          {fix.to}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Other Fixes
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CONFUSION_FIXES.medium.map((fix) => (
                        <button
                          key={`${fix.from}-${fix.to}`}
                          type="button"
                          title={fix.tooltip}
                          onClick={() => applyFix(fix.from, fix.to)}
                          className="px-2 py-1 text-xs font-medium rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                        >
                          {fix.from}
                          {' -> '}
                          {fix.to}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Province */}
                <Input
                  label="Province"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Enter province"
                  className={`${
                    provinceMissing
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : ''
                  } ${highlightField === 'province' ? 'ring-1 ring-blue-500' : ''}`}
                  hint={provinceMissing ? 'Province not detected -- please review' : undefined}
                />

                {/* Province Quick Select */}
                <div>
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    Quick Select
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {POPULAR_PROVINCES.map((prov) => (
                      <button
                        key={prov.value}
                        type="button"
                        onClick={() => {
                          setProvince(prov.value)
                          setHighlightField('province')
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                      >
                        {prov.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <Input
                  label="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Additional notes"
                />

                {/* Undo */}
                {lastChange && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Last change:</span>
                    <Badge variant="default" size="sm">
                      {lastChange.from
                        ? `${lastChange.from} -> ${lastChange.to}`
                        : 'normalized'}
                    </Badge>
                    <button
                      onClick={handleUndo}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={onConfirm}
                    className="flex-1"
                  >
                    Confirm
                    <kbd className="ml-1.5 px-1 py-0.5 text-[10px] font-mono bg-blue-700/50 rounded text-blue-200">
                      Enter
                    </kbd>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onCorrect(plateText, province, note)}
                    className="flex-1"
                  >
                    Save Edit
                    <kbd className="ml-1.5 px-1 py-0.5 text-[10px] font-mono bg-white/[0.08] rounded text-slate-400">
                      Ctrl+Enter
                    </kbd>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleNormalize}
                  >
                    Normalize
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <DeleteConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false)
          onDelete()
        }}
        plate={plateText}
        province={province}
        confidence={(item.confidence * 100).toFixed(1) + '%'}
      />

      <ImageViewer
        open={viewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        onClose={() => setViewerOpen(false)}
      />
    </>
  )
}

/* ===== MAIN QUEUE PAGE ===== */
export default function Queue() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await listPending(200)
      setItems(data)
      setLastRefresh(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleConfirm = useCallback(
    async (id) => {
      setBusyId(id)
      try {
        await verifyRead(id, { action: 'confirm', user: 'reviewer' })
        await refresh()
        addToast('Confirmed successfully', 'success')
      } catch (e) {
        setError(String(e))
      } finally {
        setBusyId(null)
      }
    },
    [refresh, addToast]
  )

  const handleCorrect = useCallback(
    async (id, corrected_text, corrected_province, note) => {
      setBusyId(id)
      try {
        await verifyRead(id, {
          action: 'correct',
          corrected_text,
          corrected_province,
          note,
          user: 'reviewer',
        })
        await refresh()
        addToast('Edit saved', 'success')
      } catch (e) {
        setError(String(e))
      } finally {
        setBusyId(null)
      }
    },
    [refresh, addToast]
  )

  const handleDelete = useCallback(
    async (id) => {
      setBusyId(id)
      try {
        await deleteRead(id)
        await refresh()
        addToast('Item deleted', 'success')
      } catch (e) {
        setError(String(e))
      } finally {
        setBusyId(null)
      }
    },
    [refresh, addToast]
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Verification Queue</h1>
          <p className="page-subtitle">
            Review OCR results and confirm or correct before saving to master
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="primary" size="lg">
            {items.length} pending
          </Badge>
          {lastRefresh && (
            <span className="text-xs text-slate-600 tabular-nums">
              {lastRefresh.toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={loading}
            icon={
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            }
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Items */}
      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<ListChecks className="h-12 w-12" />}
              title="Queue is empty"
              description="All items have been reviewed. New items will appear here automatically."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <VerificationItem
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onConfirm={() => handleConfirm(item.id)}
              onCorrect={(text, prov, note) =>
                handleCorrect(item.id, text, prov, note)
              }
              onDelete={() => handleDelete(item.id)}
              onToast={addToast}
            />
          ))}
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
