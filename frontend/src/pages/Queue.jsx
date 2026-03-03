import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { absImageUrl, deleteRead, listPending, verifyRead } from '../lib/api.js'
import { useTheme } from '../lib/ThemeContext.jsx'
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
import { RefreshCw, ListChecks, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Search, X, Check } from 'lucide-react'

/* ===== ALL 77 THAI PROVINCES ===== */
const ALL_PROVINCES = [
  "กรุงเทพมหานคร","กระบี่","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา","ชลบุรี","ชัยนาท",
  "ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม","นครพนม","นครราชสีมา",
  "นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์","ปทุมธานี","ประจวบคีรีขันธ์",
  "ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์",
  "แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยะลา","ยโสธร","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี",
  "ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร",
  "สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง",
  "อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี",
]

/* Province aliases for quick search */
const PROVINCE_ALIASES = {
  "กทม": "กรุงเทพมหานคร", "กรุงเทพ": "กรุงเทพมหานคร", "bkk": "กรุงเทพมหานคร",
  "โคราช": "นครราชสีมา", "อยุธยา": "พระนครศรีอยุธยา", "ปากน้ำ": "สมุทรปราการ",
  "อุบล": "อุบลราชธานี", "อุดร": "อุดรธานี", "สุราษ": "สุราษฎร์ธานี",
  "ชล": "ชลบุรี", "นน": "นนทบุรี",
}

/* ===== POPULAR PROVINCES ===== */
const POPULAR_PROVINCES = [
  { value: 'กรุงเทพมหานคร', label: 'กทม' },
  { value: 'สมุทรปราการ', label: 'ปราการ' },
  { value: 'สมุทรสาคร', label: 'สาคร' },
  { value: 'นนทบุรี', label: 'นนท์' },
  { value: 'ปทุมธานี', label: 'ปทุม' },
  { value: 'ชลบุรี', label: 'ชล' },
]

/* ===== SEARCHABLE PROVINCE DROPDOWN ===== */
function ProvinceDropdown({ value, onChange, light, highlightField }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [highlightedIdx, setHighlightedIdx] = useState(0)

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_PROVINCES
    const q = search.trim().toLowerCase()
    // check alias first
    const aliasMatch = PROVINCE_ALIASES[q]
    if (aliasMatch) return [aliasMatch]
    // filter: match from the beginning of province name OR contains the search text
    return ALL_PROVINCES.filter(p => {
      const pLower = p.toLowerCase()
      return pLower.startsWith(q) || pLower.includes(q)
    })
  }, [search])

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIdx(0)
  }, [filtered])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightedIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightedIdx, open])

  const selectProvince = (prov) => {
    onChange(prov)
    setOpen(false)
    setSearch('')
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIdx(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightedIdx]) selectProvince(filtered[highlightedIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
    }
  }

  const provinceMissing = !value.trim()

  return (
    <div ref={containerRef} className="relative">
      <label className={`block text-sm font-medium mb-1.5 ${light ? 'text-slate-700' : 'text-slate-300'}`}>
        Province
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          if (!open) setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={`
          w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors
          ${highlightField === 'province' ? 'ring-1 ring-blue-500' : ''}
          ${provinceMissing
            ? light
              ? 'border-amber-400 bg-amber-50'
              : 'border-amber-500/30 bg-amber-500/5'
            : ''
          }
          ${light
            ? `bg-white text-slate-900 ${!provinceMissing ? 'border-slate-300' : ''} hover:border-slate-400`
            : `bg-slate-950/80 text-slate-100 ${!provinceMissing ? 'border-white/[0.1]' : ''} hover:border-white/[0.2]`
          }
        `}
      >
        <span className={value ? '' : light ? 'text-slate-400' : 'text-slate-500'}>
          {value || 'Select province...'}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${light ? 'text-slate-400' : 'text-slate-500'}`} />
      </button>

      {provinceMissing && (
        <p className="mt-1 text-xs text-amber-500 flex items-center gap-1">
          Province not detected -- please review
        </p>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
          light
            ? 'border-slate-200 bg-white shadow-slate-200/50'
            : 'border-white/[0.1] bg-slate-900 shadow-black/40'
        }`}>
          {/* Search input */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${light ? 'border-slate-100' : 'border-white/[0.06]'}`}>
            <Search className={`h-3.5 w-3.5 flex-shrink-0 ${light ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search province..."
              className={`w-full bg-transparent text-sm outline-none placeholder:text-slate-500 ${
                light ? 'text-slate-900' : 'text-slate-100'
              }`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className={`flex-shrink-0 ${light ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Province list */}
          <ul
            ref={listRef}
            className="max-h-56 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li className={`px-3 py-2 text-sm ${light ? 'text-slate-400' : 'text-slate-500'}`}>
                No matching province
              </li>
            ) : (
              filtered.map((prov, idx) => (
                <li
                  key={prov}
                  role="option"
                  aria-selected={prov === value}
                  onClick={() => selectProvince(prov)}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                    idx === highlightedIdx
                      ? light ? 'bg-blue-50 text-blue-700' : 'bg-blue-600/20 text-blue-300'
                      : light ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-300 hover:bg-white/[0.04]'
                  } ${prov === value ? 'font-medium' : ''}`}
                >
                  <span>{prov}</span>
                  {prov === value && <Check className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

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
  const { theme } = useTheme()
  const light = theme === 'light'
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
      <div className={`flex items-center justify-between border-b px-6 py-3 ${
        light ? 'border-slate-200 bg-white/80' : 'border-white/[0.06] bg-slate-950/80'
      }`}>
        <div>
          <h3 className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
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
          <div className={`w-px h-5 ${light ? 'bg-slate-200' : 'bg-white/[0.1]'} mx-1`} />
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
  const { theme } = useTheme()
  const light = theme === 'light'
  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="Confirm Delete" size="sm">
      <div className="space-y-4">
        <p className={`text-sm ${light ? 'text-slate-600' : 'text-slate-400'}`}>
          This will permanently remove this item from the verification queue.
        </p>

        <div className={`rounded-lg border p-4 space-y-2 ${
          light ? 'border-red-200 bg-red-50' : 'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Plate</span>
            <span className={`font-mono font-medium ${light ? 'text-slate-900' : 'text-white'}`}>
              {plate || '-'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Province</span>
            <span className={light ? 'text-slate-900' : 'text-white'}>{province || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Confidence</span>
            <span className={light ? 'text-slate-900' : 'text-white'}>{confidence}</span>
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
  const { theme } = useTheme()
  const light = theme === 'light'
  const [plateText, setPlateText] = useState(item.plate_text || '')
  const [province, setProvince] = useState(item.province || '')
  const [note, setNote] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSrc, setViewerSrc] = useState('')
  const [viewerTitle, setViewerTitle] = useState('')
  const [lastChange, setLastChange] = useState(null)
  const [highlightField, setHighlightField] = useState(null)

  /* Track original values to detect edits */
  const originalPlate = item.plate_text || ''
  const originalProvince = item.province || ''
  const isEdited = plateText !== originalPlate || province !== originalProvince

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
        if (!isEdited) onConfirm()
      } else if (e.key === 'Delete' && !isTyping) {
        e.preventDefault()
        setDeleteOpen(true)
      } else if ((e.key === 'n' || e.key === 'N') && !isTyping) {
        e.preventDefault()
        handleNormalize()
      }
    },
    [busy, plateText, province, note, isEdited, onConfirm, onCorrect]
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_minmax(0,1fr)]">
            {/* Left: Image Evidence -- BIGGER IMAGES */}
            <div>
              <h3 className={`text-xs font-medium uppercase tracking-wider mb-3 ${light ? 'text-slate-500' : 'text-slate-500'}`}>
                Image Evidence
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Original */}
                <div
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border transition-colors ${
                    light
                      ? 'border-slate-200 hover:border-slate-400'
                      : 'border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                  onClick={() =>
                    openViewer(absImageUrl(item.original_url), 'Original')
                  }
                >
                  <img
                    src={absImageUrl(item.original_url)}
                    alt="Original"
                    className={`w-full h-56 object-contain ${light ? 'bg-slate-100' : 'bg-slate-950'}`}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-medium">
                      View Full
                    </span>
                  </div>
                  <div className={`absolute bottom-0 inset-x-0 px-2 py-1 ${light ? 'bg-white/80' : 'bg-slate-950/80'}`}>
                    <span className={`text-[10px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>Original</span>
                  </div>
                </div>

                {/* Crop */}
                <div
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border transition-colors ${
                    light
                      ? 'border-slate-200 hover:border-slate-400'
                      : 'border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                  onClick={() =>
                    openViewer(absImageUrl(item.crop_url), 'Cropped Plate')
                  }
                >
                  <img
                    src={absImageUrl(item.crop_url)}
                    alt="Cropped Plate"
                    className={`w-full h-56 object-contain ${light ? 'bg-slate-100' : 'bg-slate-950'}`}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-medium">
                      View Full
                    </span>
                  </div>
                  <div className={`absolute bottom-0 inset-x-0 px-2 py-1 ${light ? 'bg-white/80' : 'bg-slate-950/80'}`}>
                    <span className={`text-[10px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>Crop</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div className="flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className={`text-xs font-medium uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
                    OCR Result
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${light ? 'text-slate-400' : 'text-slate-600'}`}>
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
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
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
                          className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                            light
                              ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                              : 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                          }`}
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
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
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
                          className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                            light
                              ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          }`}
                        >
                          {fix.from}
                          {' -> '}
                          {fix.to}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Province Searchable Dropdown */}
                <ProvinceDropdown
                  value={province}
                  onChange={(val) => {
                    setProvince(val)
                    setHighlightField('province')
                  }}
                  light={light}
                  highlightField={highlightField}
                />

                {/* Province Quick Select */}
                <div>
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${light ? 'text-slate-500' : 'text-slate-500'}`}>
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
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                          province === prov.value
                            ? light
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-blue-500/40 bg-blue-500/20 text-blue-300'
                            : light
                              ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                              : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        {prov.label}
                      </button>
                    ))}
                    {province && (
                      <button
                        type="button"
                        onClick={() => {
                          setProvince('')
                          setHighlightField('province')
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                          light
                            ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                            : 'border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                        }`}
                      >
                        Clear
                      </button>
                    )}
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
              <div className={`mt-5 pt-4 border-t ${light ? 'border-slate-100' : 'border-white/[0.06]'}`}>
                {/* Edited indicator */}
                {isEdited && (
                  <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    light
                      ? 'bg-amber-50 border border-amber-200 text-amber-700'
                      : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                  }`}>
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Fields have been edited. Use <strong className="font-semibold">Save Edit</strong> (Ctrl+Enter) to save changes.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Confirm button - disabled when fields have been edited */}
                  <div className="flex-1 relative group">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || isEdited}
                      onClick={onConfirm}
                      className="w-full"
                    >
                      Confirm
                      <kbd className={`ml-1.5 px-1 py-0.5 text-[10px] font-mono rounded ${
                        isEdited
                          ? 'bg-blue-800/30 text-blue-400'
                          : 'bg-blue-700/50 text-blue-200'
                      }`}>
                        Enter
                      </kbd>
                    </Button>
                    {isEdited && (
                      <div className={`absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                        light ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
                      }`}>
                        Use Save Edit when fields are modified
                      </div>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onCorrect(plateText, province, note)}
                    className={`flex-1 ${isEdited ? light ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-white' : 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-900' : ''}`}
                  >
                    Save Edit
                    <kbd className={`ml-1.5 px-1 py-0.5 text-[10px] font-mono rounded ${
                      light ? 'bg-slate-100 text-slate-500' : 'bg-white/[0.08] text-slate-400'
                    }`}>
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
  const { theme } = useTheme()
  const light = theme === 'light'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' or 'oldest'

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

  /* Sort items by created_at or id */
  const sortedItems = React.useMemo(() => {
    if (!items || items.length === 0) return []
    const sorted = [...items]
    if (sortOrder === 'newest') {
      sorted.sort((a, b) => {
        if (a.created_at && b.created_at) return new Date(b.created_at) - new Date(a.created_at)
        return (b.id || 0) - (a.id || 0)
      })
    } else {
      sorted.sort((a, b) => {
        if (a.created_at && b.created_at) return new Date(a.created_at) - new Date(b.created_at)
        return (a.id || 0) - (b.id || 0)
      })
    }
    return sorted
  }, [items, sortOrder])

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

  const toggleSort = () => {
    setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))
  }

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
            <span className={`text-xs tabular-nums ${light ? 'text-slate-400' : 'text-slate-600'}`}>
              {lastRefresh.toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}

          {/* Sort Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleSort}
            icon={
              sortOrder === 'newest'
                ? <ArrowDown className="h-3.5 w-3.5" />
                : <ArrowUp className="h-3.5 w-3.5" />
            }
          >
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </Button>

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
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          light
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-red-500/20 bg-red-500/10 text-red-300'
        }`}>
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
          {sortedItems.map((item) => (
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
