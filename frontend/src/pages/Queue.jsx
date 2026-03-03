import React, { useCallback, useEffect, useState, useRef } from 'react'
import { absImageUrl, deleteRead, listPending, verifyRead } from '../lib/api.js'
import { 
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  ZoomIn,
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Image as ImageIcon,
  FileText,
  X,
  Minus,
  Plus,
  RotateCcw,
  Check,
  Loader2
} from 'lucide-react'

/* ===== PROVINCES DATA ===== */
const POPULAR_PROVINCES = [
  { value: 'กรุงเทพมหานคร', label: 'กทม' },
  { value: 'สมุทรปราการ', label: 'ปราการ' },
  { value: 'สมุทรสาคร', label: 'สาคร' },
  { value: 'นนทบุรี', label: 'นนท์' },
  { value: 'ปทุมธานี', label: 'ปทุม' },
  { value: 'ชลบุรี', label: 'ชล' }
]

/* ===== CONFUSABLE CHARACTER FIXES ===== */
const CONFUSION_FIXES = {
  high: [
    { from: 'ข', to: 'ฆ', tooltip: 'ข เป็น ฆ' },
    { from: 'ฆ', to: 'ข', tooltip: 'ฆ เป็น ข' },
    { from: 'ข', to: 'ม', tooltip: 'ข เป็น ม' },
    { from: 'ม', to: 'ข', tooltip: 'ม เป็น ข' }
  ],
  medium: [
    { from: 'ค', to: 'ฅ', tooltip: 'ค เป็น ฅ' },
    { from: 'ถ', to: 'ค', tooltip: 'ถ เป็น ค' },
    { from: 'ศ', to: 'ส', tooltip: 'ศ เป็น ส' },
    { from: 'ผ', to: 'พ', tooltip: 'ผ เป็น พ' },
    { from: 'พ', to: 'ผ', tooltip: 'พ เป็น ผ' },
    { from: 'บ', to: 'ป', tooltip: 'บ เป็น ป' },
    { from: 'ป', to: 'บ', tooltip: 'ป เป็น บ' }
  ]
}

/* ===== GLASS CARD COMPONENT ===== */
function GlassCard({ children, className = '', hover = true, glow = null }) {
  return (
    <div className={`
      relative overflow-hidden rounded-2xl 
      border border-white/[0.06] 
      bg-white/[0.02] backdrop-blur-2xl
      ${hover ? 'hover:border-white/[0.1] hover:bg-white/[0.03] transition-all duration-500' : ''}
      ${className}
    `}>
      {glow && (
        <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${glow} opacity-20 blur-xl pointer-events-none`} />
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

/* ===== BADGE COMPONENT ===== */
function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variants = {
    default: 'bg-white/[0.04] text-zinc-400 border-white/[0.06]',
    primary: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
  }
  
  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-[11px]',
    lg: 'px-3 py-1.5 text-[12px]'
  }
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}

/* ===== CONFIDENCE BADGE ===== */
function ConfidenceBadge({ score }) {
  const getConfig = () => {
    if (score >= 0.95) return { variant: 'success', label: 'Excellent' }
    if (score >= 0.85) return { variant: 'success', label: 'High' }
    if (score >= 0.70) return { variant: 'warning', label: 'Medium' }
    return { variant: 'danger', label: 'Low' }
  }
  
  const { variant, label } = getConfig()
  const percentage = (score * 100).toFixed(1)
  
  const colorClass = variant === 'success' ? 'bg-emerald-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-red-500'
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant={variant} size="sm">{label}</Badge>
        <span className="text-[13px] font-bold text-white">{percentage}%</span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClass} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/* ===== BUTTON COMPONENT ===== */
function Button({ 
  children, 
  variant = 'default', 
  size = 'md', 
  loading = false, 
  disabled = false,
  icon,
  className = '',
  ...props 
}) {
  const variants = {
    default: 'bg-white/[0.04] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.1]',
    primary: 'bg-emerald-500 text-white border-emerald-500/50 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20',
    secondary: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
    ghost: 'bg-transparent text-zinc-400 border-transparent hover:bg-white/[0.04] hover:text-zinc-300'
  }
  
  const sizes = {
    sm: 'px-3 py-1.5 text-[12px] gap-1.5',
    md: 'px-4 py-2 text-[13px] gap-2',
    lg: 'px-5 py-2.5 text-[14px] gap-2'
  }
  
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-semibold rounded-xl border
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  )
}

/* ===== INPUT COMPONENT ===== */
function Input({ label, hint, className = '', ...props }) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-[12px] font-semibold text-zinc-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-3 rounded-xl
          bg-white/[0.02] border border-white/[0.06]
          text-white text-[15px] font-medium
          placeholder:text-zinc-600
          focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20
          transition-all duration-200
          ${className}
        `}
        {...props}
      />
      {hint && (
        <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {hint}
        </p>
      )}
    </div>
  )
}

/* ===== TOAST CONTAINER ===== */
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm">
      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}

/* ===== TOAST COMPONENT ===== */
function Toast({ message, type = 'info' }) {
  const config = {
    success: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle2 },
    error: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', icon: XCircle },
    info: { bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-400', icon: Sparkles }
  }
  
  const { bg, text, icon: Icon } = config[type] || config.info
  
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl ${bg} animate-[slideIn_0.3s_ease-out]`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${text}`} />
      <span className={`text-[13px] font-medium ${text}`}>{message}</span>
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
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(4, s + 0.2))
      if (e.key === '-') setScale(s => Math.max(0.5, s - 0.2))
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }) }
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
    setScale(s => Math.min(4, Math.max(0.5, s + delta)))
  }

  const handleMouseDown = (e) => {
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      x: position.x,
      y: position.y
    }
  }

  const handleMouseMove = (e) => {
    if (!dragState.current.dragging) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPosition({ x: dragState.current.x + dx, y: dragState.current.y + dy })
  }

  const handleMouseUp = () => {
    dragState.current.dragging = false
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <p className="text-[11px] text-zinc-500 mt-1">
            Zoom: {(scale * 100).toFixed(0)}% | Drag to pan | Scroll to zoom
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.2))} icon={<Minus className="w-4 h-4" />} />
          <Badge variant="default" size="sm">{(scale * 100).toFixed(0)}%</Badge>
          <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.min(4, s + 0.2))} icon={<Plus className="w-4 h-4" />} />
          <Button variant="ghost" size="sm" onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }) }} icon={<RotateCcw className="w-4 h-4" />} />
          <div className="w-px h-5 bg-white/[0.08] mx-1" />
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X className="w-4 h-4" />}>
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
            className="max-h-full max-w-full select-none rounded-lg shadow-2xl"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: dragState.current.dragging ? 'grabbing' : 'grab',
              transition: dragState.current.dragging ? 'none' : 'transform 0.1s ease-out'
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
function DeleteConfirmModal({ open, onClose, onConfirm, plate, province, confidence }) {
  if (!open) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <GlassCard 
        className="w-full max-w-md p-6 border-red-500/20" 
        hover={false}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-white mb-1">Confirm Deletion</h3>
            <p className="text-[13px] text-zinc-400">This action cannot be undone.</p>
          </div>
        </div>
        
        <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 mb-6 space-y-2">
          <div className="flex justify-between text-[13px]">
            <span className="text-zinc-500">Plate</span>
            <span className="font-semibold text-white">{plate || '-'}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-zinc-500">Province</span>
            <span className="font-semibold text-white">{province || '-'}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-zinc-500">Confidence</span>
            <span className="font-semibold text-white">{confidence}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
        </div>
      </GlassCard>
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
    onToast?.('Normalized plate format', 'info')
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
      <GlassCard className="p-0 overflow-hidden" glow="from-emerald-500/5 to-cyan-500/5">
        <div className="grid grid-cols-1 xl:grid-cols-[520px_minmax(0,1fr)]">
          {/* Left: Image Evidence */}
          <div className="p-6 border-b xl:border-b-0 xl:border-r border-white/[0.04]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white">Image Evidence</h3>
                <p className="text-[11px] text-zinc-500">Click to view full size</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Original Image */}
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Original</div>
                <div 
                  className="relative group cursor-pointer rounded-xl overflow-hidden border border-white/[0.06] hover:border-emerald-500/30 transition-all duration-300"
                  onClick={() => openViewer(absImageUrl(item.original_url), 'Original Image')}
                >
                  <img
                    src={absImageUrl(item.original_url)}
                    alt="Original"
                    className="w-full h-40 object-contain bg-black/40"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                    <Badge variant="info" size="sm">
                      <ZoomIn className="w-3 h-3" />
                      View Full
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Cropped Plate */}
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Cropped Plate</div>
                <div 
                  className="relative group cursor-pointer rounded-xl overflow-hidden border border-white/[0.06] hover:border-emerald-500/30 transition-all duration-300"
                  onClick={() => openViewer(absImageUrl(item.crop_url), 'Cropped Plate')}
                >
                  <img
                    src={absImageUrl(item.crop_url)}
                    alt="Cropped Plate"
                    className="w-full h-40 object-contain bg-black/40"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                    <Badge variant="info" size="sm">
                      <ZoomIn className="w-3 h-3" />
                      View Full
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form & Actions */}
          <div className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-white">OCR Verification</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                    Enter = Confirm | Ctrl+Enter = Save Edit | N = Normalize
                  </p>
                </div>
              </div>
              <div className="w-32">
                <ConfidenceBadge score={item.confidence || 0} />
              </div>
            </div>

            {/* Plate Input */}
            <div className="space-y-5">
              <Input
                label="License Plate"
                value={plateText}
                onChange={(e) => setPlateText(e.target.value)}
                placeholder="Enter plate number"
                className={`text-xl font-bold tracking-widest ${highlightField === 'plate' ? 'ring-2 ring-emerald-500/40 border-emerald-500/40' : ''}`}
              />

              {/* Quick Fix Buttons */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-3 bg-red-400 rounded-full" />
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">High Confusion</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CONFUSION_FIXES.high.map(fix => (
                      <button
                        key={`${fix.from}-${fix.to}`}
                        type="button"
                        title={fix.tooltip}
                        onClick={() => applyFix(fix.from, fix.to)}
                        className="px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10 hover:border-red-500/30 transition-all"
                      >
                        {fix.from} → {fix.to}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-3 bg-amber-400 rounded-full" />
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Other Fixes</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CONFUSION_FIXES.medium.map(fix => (
                      <button
                        key={`${fix.from}-${fix.to}`}
                        type="button"
                        title={fix.tooltip}
                        onClick={() => applyFix(fix.from, fix.to)}
                        className="px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all"
                      >
                        {fix.from} → {fix.to}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Province Input */}
              <Input
                label="Province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Enter province"
                className={`text-lg font-semibold ${provinceMissing ? 'border-amber-500/30 bg-amber-500/5' : ''} ${highlightField === 'province' ? 'ring-2 ring-emerald-500/40 border-emerald-500/40' : ''}`}
                hint={provinceMissing ? 'Province not detected - please verify' : undefined}
              />

              {/* Province Quick Select */}
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">Quick Select Province</div>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_PROVINCES.map(prov => (
                    <button
                      key={prov.value}
                      type="button"
                      onClick={() => { setProvince(prov.value); setHighlightField('province') }}
                      className="px-3 py-2 text-[12px] font-semibold rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400 transition-all"
                    >
                      {prov.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <Input
                label="Note (Optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add any notes..."
              />

              {/* Undo */}
              {lastChange && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                  <span>Last change:</span>
                  <Badge variant="default" size="sm">
                    {lastChange.from ? `${lastChange.from} → ${lastChange.to}` : 'Normalized'}
                  </Badge>
                  <button
                    onClick={handleUndo}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 pt-5 border-t border-white/[0.04]">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  loading={busy}
                  onClick={onConfirm}
                  className="flex-1"
                  icon={<Check className="w-4 h-4" />}
                >
                  Confirm
                  <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-white/20 rounded">Enter</kbd>
                </Button>
                
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onCorrect(plateText, province, note)}
                  className="flex-1"
                  icon={<Edit3 className="w-4 h-4" />}
                >
                  Save Edit
                  <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-cyan-500/20 rounded">Ctrl+Enter</kbd>
                </Button>
                
                <Button
                  variant="default"
                  onClick={handleNormalize}
                  icon={<Sparkles className="w-4 h-4" />}
                >
                  Normalize
                </Button>

                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

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

/* ===== EMPTY STATE ===== */
function EmptyState() {
  return (
    <GlassCard className="p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-[18px] font-semibold text-white mb-2">Queue Empty</h3>
        <p className="text-[13px] text-zinc-500 max-w-xs">
          All items have been verified. New items will appear here automatically.
        </p>
      </div>
    </GlassCard>
  )
}

/* ===== LOADING STATE ===== */
function LoadingState() {
  return (
    <GlassCard className="p-12">
      <div className="flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        <span className="ml-3 text-[14px] text-zinc-400">Loading queue...</span>
      </div>
    </GlassCard>
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
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
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

  const handleConfirm = useCallback(async (id) => {
    setBusyId(id)
    try {
      await verifyRead(id, { action: 'confirm', user: 'reviewer' })
      await refresh()
      addToast('Item confirmed successfully', 'success')
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
      addToast('Correction saved successfully', 'success')
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
      addToast('Item deleted successfully', 'success')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }, [refresh, addToast])

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8 space-y-5">
        {/* Header */}
        <GlassCard className="p-6" glow="from-emerald-500/10 to-cyan-500/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-emerald-500/30 blur-lg" />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-[22px] font-bold text-white tracking-tight">Verification Queue</h1>
                <p className="text-[13px] text-zinc-500 mt-0.5">
                  Review OCR results before saving to Master DB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="primary" size="lg">
                {items.length} Pending
              </Badge>
              {lastRefresh && (
                <Badge variant="default" size="md">
                  Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </Badge>
              )}
              <Button
                variant="default"
                size="md"
                onClick={refresh}
                disabled={loading}
                icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Error */}
        {error && (
          <GlassCard className="p-4 border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-red-400">Error loading queue</p>
                <p className="text-[12px] text-zinc-500 mt-0.5">{error}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Items */}
        {loading && items.length === 0 ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {items.map(item => (
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

        {/* Auto-refresh indicator */}
        <div className="text-center">
          <span className="text-[11px] text-zinc-600">Auto-refresh every 10 seconds</span>
        </div>

        <ToastContainer toasts={toasts} />
      </div>
    </div>
  )
}
