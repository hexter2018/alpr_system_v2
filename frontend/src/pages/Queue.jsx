import React, { useCallback, useEffect, useState, useRef } from 'react'
import { absImageUrl, deleteRead, listPending, verifyRead } from '../lib/api.js'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Undo2,
  X,
  AlertTriangle,
  CheckCircle2,
  Info,
  Image as ImageIcon,
  ListChecks,
  Clock,
  Crosshair,
} from 'lucide-react'

/* ===== PROVINCES DATA ===== */
const POPULAR_PROVINCES = [
  { value: 'กรุงเทพมหานคร', label: 'กทม' },
  { value: 'สมุทรปราการ', label: 'สมุทรปราการ' },
  { value: 'สมุทรสาคร', label: 'สมุทรสาคร' },
  { value: 'นนทบุรี', label: 'นนทบุรี' },
  { value: 'ปทุมธานี', label: 'ปทุมธานี' },
  { value: 'ชลบุรี', label: 'ชลบุรี' },
]

/* ===== CONFUSABLE CHARACTER FIXES ===== */
const CONFUSION_FIXES = {
  high: [
    { from: 'ข', to: 'ฆ', tooltip: 'ข -> ฆ' },
    { from: 'ฆ', to: 'ข', tooltip: 'ฆ -> ข' },
    { from: 'ข', to: 'ม', tooltip: 'ข -> ม' },
    { from: 'ม', to: 'ข', tooltip: 'ม -> ข' },
  ],
  medium: [
    { from: 'ค', to: 'ฅ', tooltip: 'ค -> ฅ' },
    { from: 'ถ', to: 'ค', tooltip: 'ถ -> ค' },
    { from: 'ศ', to: 'ส', tooltip: 'ศ -> ส' },
    { from: 'ผ', to: 'พ', tooltip: 'ผ -> พ' },
    { from: 'พ', to: 'ผ', tooltip: 'พ -> ผ' },
    { from: 'บ', to: 'ป', tooltip: 'บ -> ป' },
    { from: 'ป', to: 'บ', tooltip: 'ป -> บ' },
  ],
}

/* ===== TOAST CONTAINER ===== */
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl animate-[slideInRight_0.3s_ease-out] ${
            toast.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300'
              : toast.type === 'error'
              ? 'border-rose-500/20 bg-rose-500/[0.08] text-rose-300'
              : 'border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300'
          }`}
          style={{ backdropFilter: 'blur(16px)' }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Info className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

/* ===== IMAGE VIEWER MODAL ===== */
function ImageViewer({ open, src, title, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, x: 0, y: 0 })

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, s + 0.2))
      if (e.key === '-') setScale((s) => Math.max(0.5, s - 0.2))
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) { setScale(1); setPosition({ x: 0, y: 0 }) }
  }, [open, src])

  if (!open) return null

  const handleWheel = (e) => {
    e.preventDefault()
    setScale((s) => Math.min(4, Math.max(0.5, s + e.deltaY * -0.001)))
  }

  const handleMouseDown = (e) => {
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, x: position.x, y: position.y }
  }

  const handleMouseMove = (e) => {
    if (!dragState.current.dragging) return
    setPosition({
      x: dragState.current.x + e.clientX - dragState.current.startX,
      y: dragState.current.y + e.clientY - dragState.current.startY,
    })
  }

  const handleMouseUp = () => { dragState.current.dragging = false }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      style={{ backdropFilter: 'blur(12px)' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">Zoom: {(scale * 100).toFixed(0)}%</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-xs tabular-nums text-zinc-400">{(scale * 100).toFixed(0)}%</span>
          <button onClick={() => setScale((s) => Math.min(4, s + 0.2))} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors">
            <Plus className="h-4 w-4" />
          </button>
          <div className="mx-2 h-4 w-px bg-white/[0.06]" />
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden" onWheel={handleWheel}>
        <div className="flex h-full w-full items-center justify-center p-8">
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full select-none rounded-2xl shadow-2xl"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: dragState.current.dragging ? 'grabbing' : 'grab',
              transition: dragState.current.dragging ? 'none' : 'transform 0.1s ease-out',
            }}
            onMouseDown={handleMouseDown}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}

/* ===== DELETE MODAL ===== */
function DeleteConfirmModal({ open, onClose, onConfirm, plate, province, confidence }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" style={{ backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl" style={{ backdropFilter: 'blur(24px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white">Confirm Delete</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400">Are you sure you want to remove this item from the queue?</p>
          <div className="rounded-xl border border-rose-500/[0.12] bg-rose-500/[0.04] p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Plate</span>
              <span className="font-mono font-semibold text-zinc-200">{plate || '-'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Province</span>
              <span className="text-zinc-200">{province || '-'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Confidence</span>
              <span className="tabular-nums text-zinc-200">{confidence}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.06] transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 shadow-lg shadow-rose-500/20 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== CONFIDENCE INDICATOR ===== */
function ConfidenceIndicator({ score }) {
  const pct = score * 100
  const getConfig = () => {
    if (pct >= 95) return { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Very High' }
    if (pct >= 85) return { color: 'text-emerald-300', bg: 'bg-emerald-400', label: 'High' }
    if (pct >= 70) return { color: 'text-amber-400', bg: 'bg-amber-500', label: 'Medium' }
    return { color: 'text-rose-400', bg: 'bg-rose-500', label: 'Low' }
  }
  const c = getConfig()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${c.color}`}>{c.label}</span>
        <span className="text-sm font-bold tabular-nums text-white">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className={`h-full rounded-full ${c.bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ===== QUEUE ITEM (LEFT PANEL LIST) ===== */
function QueueItem({ item, isActive, onSelect }) {
  const confidence = item.confidence || 0
  const pct = confidence * 100
  const dotColor = pct >= 85 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3 transition-all duration-200 ${
        isActive
          ? 'border-white/[0.12] bg-white/[0.06]'
          : 'border-transparent bg-transparent hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-14 rounded-lg overflow-hidden bg-white/[0.03] flex-shrink-0 border border-white/[0.06]">
          <img
            src={absImageUrl(item.crop_url)}
            alt="Plate"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white truncate font-mono tracking-wide">
              {item.plate_text || 'Unknown'}
            </span>
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
          </div>
          <div className="text-[11px] text-zinc-500 truncate mt-0.5">
            {item.province || 'No province'} &middot; {(confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </button>
  )
}

/* ===== DETAIL PANEL (RIGHT SIDE) ===== */
function DetailPanel({ item, busy, onConfirm, onCorrect, onDelete, onToast }) {
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

  // Sync when item changes
  useEffect(() => {
    setPlateText(item.plate_text || '')
    setProvince(item.province || '')
    setNote('')
    setLastChange(null)
  }, [item.id])

  useEffect(() => {
    if (!highlightField) return
    const timer = setTimeout(() => setHighlightField(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightField])

  const handleKeyDown = useCallback((e) => {
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
  }, [busy, plateText, province, note, onConfirm, onCorrect])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const applyFix = (from, to) => {
    const next = plateText.replace(new RegExp(from, 'g'), to)
    setLastChange({ field: 'plate', from, to, prev: plateText })
    setPlateText(next)
    setHighlightField('plate')
    onToast?.(`Replaced ${from} with ${to}`, 'info')
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
    onToast?.('Plate text normalized', 'info')
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
      <div className="flex h-full flex-col">
        {/* Top: Image Evidence */}
        <div className="border-b border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="h-3.5 w-3.5 text-zinc-500" />
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Image Evidence</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Original Image */}
            <div
              className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 bg-black"
              onClick={() => openViewer(absImageUrl(item.original_url), 'Original Image')}
            >
              <img src={absImageUrl(item.original_url)} alt="Original" className="w-full h-40 object-contain" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Maximize2 className="h-5 w-5 text-white" />
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                <span className="text-[10px] font-medium text-zinc-400">Original</span>
              </div>
            </div>
            {/* Cropped Plate with targeting reticle */}
            <div
              className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 bg-black"
              onClick={() => openViewer(absImageUrl(item.crop_url), 'Cropped Plate')}
            >
              <img src={absImageUrl(item.crop_url)} alt="Cropped" className="w-full h-40 object-contain" />
              {/* Reticle overlay */}
              <div className="absolute inset-3 border border-cyan-400/30 rounded-lg pointer-events-none">
                <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-cyan-400/60 rounded-tl" />
                <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-cyan-400/60 rounded-tr" />
                <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-cyan-400/60 rounded-bl" />
                <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-cyan-400/60 rounded-br" />
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 pointer-events-none">
                <Crosshair className="h-2.5 w-2.5 text-cyan-400" />
                <span className="text-[9px] font-semibold text-cyan-400">DETECTED</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Maximize2 className="h-5 w-5 text-white" />
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                <span className="text-[10px] font-medium text-zinc-400">Cropped Plate</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Confidence */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <ConfidenceIndicator score={item.confidence || 0} />
          </div>

          {/* Plate Input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Plate Number</label>
            <input
              value={plateText}
              onChange={(e) => setPlateText(e.target.value)}
              placeholder="Enter plate number"
              className={`w-full rounded-xl border bg-black/40 px-4 py-3 text-lg font-bold font-mono tracking-[0.15em] text-white placeholder:text-zinc-700 transition-all duration-200 ${
                highlightField === 'plate'
                  ? 'border-cyan-500/40 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-500/10'
                  : 'border-white/[0.08] focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08]'
              }`}
            />
          </div>

          {/* Quick Fix Buttons */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Common confusions</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONFUSION_FIXES.high.map((fix) => (
                  <button
                    key={`${fix.from}-${fix.to}`}
                    type="button"
                    title={fix.tooltip}
                    onClick={() => applyFix(fix.from, fix.to)}
                    className="rounded-lg border border-rose-500/[0.12] bg-rose-500/[0.04] px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/[0.08] hover:border-rose-500/[0.2] transition-all duration-200"
                  >
                    {fix.from}{'→'}{fix.to}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Other fixes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONFUSION_FIXES.medium.map((fix) => (
                  <button
                    key={`${fix.from}-${fix.to}`}
                    type="button"
                    title={fix.tooltip}
                    onClick={() => applyFix(fix.from, fix.to)}
                    className="rounded-lg border border-amber-500/[0.12] bg-amber-500/[0.04] px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/[0.08] hover:border-amber-500/[0.2] transition-all duration-200"
                  >
                    {fix.from}{'→'}{fix.to}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Province Input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Province</label>
            <input
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Enter province"
              className={`w-full rounded-xl border bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 transition-all duration-200 ${
                provinceMissing
                  ? 'border-amber-500/30 bg-amber-500/[0.03]'
                  : highlightField === 'province'
                  ? 'border-cyan-500/40 ring-2 ring-cyan-500/20'
                  : 'border-white/[0.08] focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08]'
              }`}
            />
            {provinceMissing && (
              <p className="mt-1.5 text-[11px] text-amber-400/80">Province not detected -- confirm or correct manually</p>
            )}
          </div>

          {/* Province Quick Select */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Popular provinces</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {POPULAR_PROVINCES.map((prov) => (
                <button
                  key={prov.value}
                  type="button"
                  onClick={() => { setProvince(prov.value); setHighlightField('province') }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                    province === prov.value
                      ? 'border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-300'
                      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.1] hover:text-zinc-200'
                  }`}
                >
                  {prov.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08] transition-all duration-200"
            />
          </div>

          {/* Undo */}
          {lastChange && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Undo2 className="h-3 w-3" />
              <span>Last change: {lastChange.from ? `${lastChange.from} to ${lastChange.to}` : 'Normalized'}</span>
              <button onClick={handleUndo} className="text-cyan-400 hover:text-cyan-300 font-semibold">
                Undo
              </button>
            </div>
          )}
        </div>

        {/* Bottom: Actions */}
        <div className="border-t border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="h-3 w-3 text-zinc-700" />
            <span className="text-[10px] text-zinc-600">Enter = Confirm &middot; Ctrl+Enter = Save Edit &middot; N = Normalize &middot; Del = Delete</span>
          </div>
          <div className="flex gap-2">
            {/* Verify Button -- prominent emerald with glow */}
            <button
              disabled={busy}
              onClick={onConfirm}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Check className="h-4 w-4" />
              Verify
            </button>
            {/* Save Edit */}
            <button
              disabled={busy}
              onClick={() => onCorrect(plateText, province, note)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Save className="h-4 w-4" />
              Save Edit
            </button>
            {/* Reject/Delete -- ghost with red hover */}
            <button
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
              className="rounded-xl border border-white/[0.06] bg-transparent px-3.5 py-3 text-zinc-500 hover:bg-rose-500/[0.08] hover:border-rose-500/[0.2] hover:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {/* Normalize */}
            <button
              onClick={handleNormalize}
              className="rounded-xl border border-white/[0.06] bg-transparent px-3.5 py-3 text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 transition-all duration-200"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteOpen(false); onDelete() }}
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
  const [selectedIndex, setSelectedIndex] = useState(0)

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
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

  // Navigate items with keyboard
  useEffect(() => {
    const handleNav = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(items.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', handleNav)
    return () => window.removeEventListener('keydown', handleNav)
  }, [items.length])

  const handleConfirm = useCallback(async (id) => {
    setBusyId(id)
    try {
      await verifyRead(id, { action: 'confirm', user: 'reviewer' })
      await refresh()
      addToast('Confirmed successfully', 'success')
      setSelectedIndex((i) => Math.max(0, i))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }, [refresh, addToast])

  const handleCorrect = useCallback(async (id, corrected_text, corrected_province, note) => {
    setBusyId(id)
    try {
      await verifyRead(id, { action: 'correct', corrected_text, corrected_province, note, user: 'reviewer' })
      await refresh()
      addToast('Correction saved', 'success')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }, [refresh, addToast])

  const handleDelete = useCallback(async (id) => {
    setBusyId(id)
    try {
      await deleteRead(id)
      await refresh()
      addToast('Item deleted', 'success')
      setSelectedIndex((i) => Math.max(0, i - 1))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }, [refresh, addToast])

  const selectedItem = items[selectedIndex] || null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Verification Queue</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Review OCR results and verify before adding to master database</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <ListChecks className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs font-bold tabular-nums text-white">{items.length}</span>
            <span className="text-[11px] text-zinc-500">pending</span>
          </div>
          {lastRefresh && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <Clock className="h-3 w-3 text-zinc-500" />
              <span className="text-[11px] text-zinc-500">
                {lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-50 transition-all duration-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/[0.15] bg-rose-500/[0.05] px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-8 w-8 rounded-full border-2 border-white/[0.06]" />
              <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            </div>
            <p className="text-xs text-zinc-500">Loading queue...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">Queue is empty</h3>
          <p className="mt-1 text-xs text-zinc-600">All items have been verified. Great work!</p>
        </div>
      ) : (
        /* Split View */
        <div className="flex rounded-2xl border border-white/[0.06] bg-white/[0.01] overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: '500px' }}>
          {/* Left: List Panel */}
          <div className="w-80 flex-shrink-0 border-r border-white/[0.06] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">
                {selectedIndex + 1} of {items.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                  disabled={selectedIndex === 0}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setSelectedIndex((i) => Math.min(items.length - 1, i + 1))}
                  disabled={selectedIndex >= items.length - 1}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {items.map((item, idx) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  isActive={idx === selectedIndex}
                  onSelect={() => setSelectedIndex(idx)}
                />
              ))}
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="flex-1 min-w-0">
            {selectedItem ? (
              <DetailPanel
                key={selectedItem.id}
                item={selectedItem}
                busy={busyId === selectedItem.id}
                onConfirm={() => handleConfirm(selectedItem.id)}
                onCorrect={(text, prov, note) => handleCorrect(selectedItem.id, text, prov, note)}
                onDelete={() => handleDelete(selectedItem.id)}
                onToast={addToast}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-600">Select an item to review</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
