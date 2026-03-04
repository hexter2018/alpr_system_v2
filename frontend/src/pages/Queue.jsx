import React, { useCallback, useEffect, useState, useRef } from 'react'
import { absImageUrl, deleteRead, listPending, verifyRead } from '../lib/api.js'
import {
  Button, Card, CardHeader, CardBody, Input, Badge, ConfidenceBadge,
  Toast, Modal, EmptyState, Spinner, PageHeader, StatCard,
} from '../components/UIComponents.jsx'
import {
  CheckCircle, Edit3, Trash2, RefreshCw, ZoomIn, ZoomOut,
  RotateCcw, X, Keyboard, Clock, ListChecks, Settings2,
  CalendarClock, Filter, XCircle, ChevronDown, Search,
} from 'lucide-react'

/* ===== PROVINCES DATA ===== */
const POPULAR_PROVINCES = [
  { value: 'กรุงเทพมหานคร', label: 'กทม' },
  { value: 'สมุทรปราการ', label: 'ปราการ' },
  { value: 'สมุทรสาคร', label: 'สาคร' },
  { value: 'นนทบุรี', label: 'นนท์' },
  { value: 'ปทุมธานี', label: 'ปทุม' },
  { value: 'ชลบุรี', label: 'ชล' },
]

const ALL_PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร',
  'ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร',
  'เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม',
  'นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี',
  'นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์',
  'ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พังงา','พัทลุง','พิจิตร',
  'พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','พะเยา','ภูเก็ต',
  'มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด',
  'ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย',
  'ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม',
  'สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี',
  'สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง',
  'อุดรธานี','อุทัยธานี','อุตรดิตถ์','อุบลราชธานี','อำนาจเจริญ',
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
    setPosition({ x: dragState.current.x + e.clientX - dragState.current.startX, y: dragState.current.y + e.clientY - dragState.current.startY })
  }
  const handleMouseUp = () => { dragState.current.dragging = false }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-raised/80 backdrop-blur">
        <div>
          <h3 className="text-lg font-semibold text-content">{title}</h3>
          <p className="text-xs text-content-tertiary mt-0.5">
            Zoom: {(scale * 100).toFixed(0)}% | Scroll to zoom | Drag to pan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Badge variant="default" size="sm">{(scale * 100).toFixed(0)}%</Badge>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(4, s + 0.2))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" /> Close
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden" onWheel={handleWheel}>
        <div className="flex h-full w-full items-center justify-center p-8">
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full select-none shadow-2xl rounded-lg"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: dragState.current.dragging ? 'grabbing' : 'grab',
              transition: dragState.current.dragging ? 'none' : 'transform 0.1s ease-out',
            }}
            onMouseDown={handleMouseDown}
            draggable={false}
            crossOrigin="anonymous"
          />
        </div>
      </div>
    </div>
  )
}

/* ===== DELETE CONFIRMATION MODAL ===== */
function DeleteConfirmModal({ open, onClose, onConfirm, plate, province, confidence }) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title="Confirm Delete" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-secondary">
          Please confirm deletion of this item from the review queue.
        </p>
        <Card className="bg-danger-muted border-danger/20">
          <CardBody className="space-y-2">
            {[
              { label: 'Plate', value: plate || '-' },
              { label: 'Province', value: province || '-' },
              { label: 'Confidence', value: confidence },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className="text-content-secondary">{row.label}</span>
                <span className="font-semibold text-content">{row.value}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Confirm Delete</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===== PROVINCE COMBOBOX ===== */
function ProvinceCombobox({ value, onChange, highlight, missing }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = ALL_PROVINCES.filter((p) =>
    p.startsWith(search) || p.includes(search)
  )

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.closest('.province-combo')?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [open, search])

  const handleSelect = (prov) => {
    onChange(prov)
    setSearch('')
    setOpen(false)
  }

  return (
    <div className="province-combo relative">
      <label className="block text-sm font-medium text-content-secondary mb-1.5">Province</label>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={`
          w-full flex items-center justify-between rounded-xl border bg-surface px-4 py-2.5 text-sm text-content transition-colors
          ${missing ? 'border-warning' : 'border-border'} ${highlight ? 'ring-2 ring-accent' : ''}
          hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20
        `}
      >
        <span className={`font-semibold truncate ${value ? 'text-content' : 'text-content-tertiary'}`}>
          {value || 'Select province...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-content-tertiary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {missing && !open && (
        <p className="mt-1.5 text-xs text-warning">Province not detected - you can confirm or correct it</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-surface-raised shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-4 h-4 text-content-tertiary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search province..."
              className="w-full bg-transparent text-sm text-content placeholder:text-content-tertiary focus:outline-none"
              autoComplete="off"
            />
          </div>
          <ul ref={listRef} className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-content-tertiary text-center">No matching province</li>
            )}
            {filtered.map((prov) => (
              <li key={prov}>
                <button
                  type="button"
                  onClick={() => handleSelect(prov)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent/10 ${value === prov ? 'bg-accent/10 text-accent font-semibold' : 'text-content'}`}
                >
                  {prov}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ===== VERIFICATION ITEM ===== */
function VerificationItem({ item, busy, onConfirm, onCorrect, onDelete, onToast }) {
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

  const handleKeyDown = useCallback((e) => {
    if (busy) return
    const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); onCorrect(plateText, province, note) }
    else if (e.key === 'Enter' && !e.ctrlKey && !isTyping) { e.preventDefault(); onConfirm() }
    else if (e.key === 'Delete' && !isTyping) { e.preventDefault(); setDeleteOpen(true) }
    else if ((e.key === 'n' || e.key === 'N') && !isTyping) { e.preventDefault(); handleNormalize() }
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
    onToast?.(`Replaced ${from} -> ${to}`, 'info')
  }

  const handleNormalize = () => {
    const normalized = plateText.trim().replace(/[\s\-.]/g, '').replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d)).toUpperCase()
    setLastChange({ field: 'plate', prev: plateText })
    setPlateText(normalized)
    setHighlightField('plate')
    onToast?.('Plate text normalized', 'info')
  }

  const handleUndo = () => {
    if (!lastChange) return
    if (lastChange.field === 'plate') { setPlateText(lastChange.prev); setHighlightField('plate') }
    setLastChange(null)
  }

  const openViewer = (src, title) => { setViewerSrc(src); setViewerTitle(title); setViewerOpen(true) }

  return (
    <>
      <Card className="overflow-hidden">
        {/* Top: Plate Text - prominent display */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-content">Plate Text</h3>
              <Badge variant={item.confidence >= 0.9 ? 'success' : item.confidence >= 0.7 ? 'warning' : 'danger'} size="sm">
                {(item.confidence * 100).toFixed(0)}% confidence
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Keyboard className="w-3 h-3 text-content-tertiary" />
              <p className="text-xs text-content-tertiary">
                Enter = Confirm | Ctrl+Enter = Save Edit | N = Normalize | Delete = Remove
              </p>
            </div>
          </div>
          <input
            type="text"
            value={plateText}
            onChange={(e) => setPlateText(e.target.value)}
            placeholder="Enter plate text"
            className={`
              w-full rounded-xl border bg-surface-inset px-6 py-4 text-content
              text-3xl xl:text-4xl font-mono font-bold tracking-[0.15em] text-center
              transition-colors
              border-border focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none
              placeholder:text-content-tertiary placeholder:text-2xl
              ${highlightField === 'plate' ? 'ring-2 ring-accent' : ''}
            `}
          />
          {/* Quick Fix Buttons - inline below plate text */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              <span className="text-xs font-medium text-content-tertiary">Confusions</span>
            </div>
            {CONFUSION_FIXES.high.map((fix) => (
              <button key={`${fix.from}-${fix.to}`} type="button" title={fix.tooltip} onClick={() => applyFix(fix.from, fix.to)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-danger/30 bg-danger-muted text-danger-content hover:bg-danger/20 transition-colors"
              >
                {fix.from}{'→'}{fix.to}
              </button>
            ))}
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              <span className="text-xs font-medium text-content-tertiary">Fixes</span>
            </div>
            {CONFUSION_FIXES.medium.map((fix) => (
              <button key={`${fix.from}-${fix.to}`} type="button" title={fix.tooltip} onClick={() => applyFix(fix.from, fix.to)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-warning/30 bg-warning-muted text-warning-content hover:bg-warning/20 transition-colors"
              >
                {fix.from}{'→'}{fix.to}
              </button>
            ))}
            {lastChange && (
              <>
                <div className="w-px h-4 bg-border" />
                <Badge variant="default" size="sm">
                  {lastChange.from ? `${lastChange.from}→${lastChange.to}` : 'Normalized'}
                </Badge>
                <button onClick={handleUndo} className="text-accent hover:underline text-xs font-medium flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bottom: two-column with images and form */}
        <div className="grid grid-cols-1 xl:grid-cols-2">
          {/* Left: Image Evidence */}
          <div className="p-5 border-b xl:border-b-0 xl:border-r border-border">
            <h3 className="text-sm font-semibold text-content mb-3">Image Evidence</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { url: item.original_url, label: 'Original Image' },
                { url: item.crop_url, label: 'Plate Crop' },
              ].map((img) => (
                <div key={img.label}>
                  <p className="text-xs font-medium text-content-tertiary mb-2">{img.label}</p>
                  <button
                    onClick={() => openViewer(absImageUrl(img.url), img.label)}
                    className="relative group w-full rounded-xl overflow-hidden border border-border hover:border-accent/40 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <img src={absImageUrl(img.url)} alt={img.label} className="w-full h-52 object-contain bg-surface-inset" crossOrigin="anonymous" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-4">
                      <Badge variant="primary" size="sm"><ZoomIn className="w-3 h-3 mr-1" /> View full size</Badge>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Province, Notes, Actions */}
          <div className="p-5 flex flex-col">
            <div className="space-y-4 flex-1">
              {/* Province Combobox */}
              <ProvinceCombobox
                value={province}
                onChange={(v) => { setProvince(v); setHighlightField('province') }}
                highlight={highlightField === 'province'}
                missing={provinceMissing}
              />

              <div>
                <p className="text-xs font-medium text-content-tertiary mb-2">Quick Select Province</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_PROVINCES.map((prov) => (
                    <button key={prov.value} type="button" onClick={() => { setProvince(prov.value); setHighlightField('province') }}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border bg-surface-raised text-content hover:bg-surface-overlay hover:border-accent/30 transition-colors"
                    >
                      {prov.label}
                    </button>
                  ))}
                </div>
              </div>

              <Input label="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Additional notes" />
            </div>

            {/* Action Buttons */}
            <div className="mt-5 pt-5 border-t border-border">
              <div className="flex flex-wrap gap-2.5">
                <Button variant="primary" disabled={busy} onClick={onConfirm} className="flex-1 min-w-0 shadow-sm shadow-accent/20"
                  icon={<CheckCircle className="w-4 h-4" />}>
                  Confirm
                  <kbd className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-white/20 rounded hidden sm:inline-block">Enter</kbd>
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => onCorrect(plateText, province, note)} className="flex-1 min-w-0"
                  icon={<Edit3 className="w-4 h-4" />}>
                  Save Edit
                  <kbd className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-surface-overlay rounded hidden sm:inline-block">Ctrl+Enter</kbd>
                </Button>
                <Button variant="secondary" onClick={handleNormalize} icon={<Settings2 className="w-4 h-4" />}>
                  Normalize
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => setDeleteOpen(true)} className="shadow-sm shadow-danger/10" icon={<Trash2 className="w-4 h-4" />}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <DeleteConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteOpen(false); onDelete() }}
        plate={plateText}
        province={province}
        confidence={(item.confidence * 100).toFixed(1) + '%'}
      />
      <ImageViewer open={viewerOpen} src={viewerSrc} title={viewerTitle} onClose={() => setViewerOpen(false)} />
    </>
  )
}

/* ===== TIME RANGE PRESETS ===== */
const TIME_PRESETS = [
  { label: 'Last 15 min', minutes: 15 },
  { label: 'Last 1 hr', minutes: 60 },
  { label: 'Last 6 hr', minutes: 360 },
  { label: 'Last 24 hr', minutes: 1440 },
  { label: 'Last 7 days', minutes: 10080 },
]

function toLocalDatetime(date) {
  if (!date) return ''
  const d = new Date(date)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

/* ===== TIME RANGE FILTER ===== */
function TimeRangeFilter({ startDate, endDate, onStartChange, onEndChange, onClear, onPreset }) {
  const hasFilter = startDate || endDate

  return (
    <Card className="overflow-hidden">
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-content">Time Range Filter</h3>
            {hasFilter && (
              <Badge variant="primary" size="sm">Active</Badge>
            )}
          </div>
          {hasFilter && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs font-medium text-content-tertiary hover:text-danger transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Clear Filter
            </button>
          )}
        </div>

        {/* Quick Presets */}
        <div>
          <p className="text-xs font-medium text-content-tertiary mb-2">Quick Select</p>
          <div className="flex flex-wrap gap-2">
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                onClick={() => onPreset(preset.minutes)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface-raised text-content hover:bg-surface-overlay hover:border-accent/30 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1.5">Start Date & Time</label>
            <input
              type="datetime-local"
              value={toLocalDatetime(startDate)}
              onChange={(e) => onStartChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface-raised text-content focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1.5">End Date & Time</label>
            <input
              type="datetime-local"
              value={toLocalDatetime(endDate)}
              onChange={(e) => onEndChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface-raised text-content focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </div>
        </div>
      </CardBody>
    </Card>
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
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await listPending(200, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setItems(data)
      setLastRefresh(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleConfirm = useCallback(async (id) => {
    setBusyId(id)
    try {
      await verifyRead(id, { action: 'confirm', user: 'reviewer' })
      await refresh()
      addToast('Confirmed successfully', 'success')
    } catch (e) { setError(String(e)) } finally { setBusyId(null) }
  }, [refresh, addToast])

  const handleCorrect = useCallback(async (id, corrected_text, corrected_province, note) => {
    setBusyId(id)
    try {
      await verifyRead(id, { action: 'correct', corrected_text, corrected_province, note, user: 'reviewer' })
      await refresh()
      addToast('Correction saved', 'success')
    } catch (e) { setError(String(e)) } finally { setBusyId(null) }
  }, [refresh, addToast])

  const handleDelete = useCallback(async (id) => {
    setBusyId(id)
    try {
      await deleteRead(id)
      await refresh()
      addToast('Item deleted', 'success')
    } catch (e) { setError(String(e)) } finally { setBusyId(null) }
  }, [refresh, addToast])

  const handlePreset = useCallback((minutes) => {
    const now = new Date()
    const start = new Date(now.getTime() - minutes * 60 * 1000)
    setStartDate(start.toISOString())
    setEndDate(now.toISOString())
    setFilterOpen(true)
  }, [])

  const handleClearFilter = useCallback(() => {
    setStartDate('')
    setEndDate('')
  }, [])

  const hasTimeFilter = startDate || endDate

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification Queue"
        description="Review OCR results and confirm or correct before saving to Master DB"
        actions={
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <Badge variant="default" size="sm">
                Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Badge>
            )}
            <Button
              variant={hasTimeFilter ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilterOpen((v) => !v)}
              icon={<Filter className="w-4 h-4" />}
            >
              {hasTimeFilter ? 'Filtered' : 'Filter'}
            </Button>
            <Button variant="secondary" size="sm" onClick={refresh} loading={loading}
              icon={!loading ? <RefreshCw className="w-4 h-4" /> : undefined}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        }
      />

      {/* Time Range Filter */}
      {filterOpen && (
        <TimeRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          onClear={handleClearFilter}
          onPreset={handlePreset}
        />
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pending" value={items.length} icon={<Clock className="w-5 h-5" />} />
        <StatCard title="Auto-refresh" value="10s" icon={<RefreshCw className="w-5 h-5" />} />
        <StatCard title="Queue Status" value={items.length === 0 ? 'Clear' : 'Active'} icon={<ListChecks className="w-5 h-5" />} />
      </div>

      {error && (
        <Card className="bg-danger-muted border-danger/30">
          <CardBody>
            <p className="text-sm text-danger-content">{error}</p>
          </CardBody>
        </Card>
      )}

      {loading && items.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
              <span className="ml-3 text-content-secondary">Loading queue...</span>
            </div>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<CheckCircle className="w-8 h-8" />}
              title="Queue is empty"
              description="All items have been reviewed. The queue will auto-refresh when new items arrive."
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
              onCorrect={(text, prov, note) => handleCorrect(item.id, text, prov, note)}
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
