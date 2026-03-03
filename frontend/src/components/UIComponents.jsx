import React from 'react'
import { useTheme } from '../lib/ThemeContext.jsx'

/* ===== BUTTONS ===== */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className = '',
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950'

  const variants = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 focus:ring-blue-500',
    secondary:
      'border border-white/[0.1] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white focus:ring-slate-500',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 focus:ring-emerald-500',
    danger:
      'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 focus:ring-red-500',
    ghost:
      'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 focus:ring-slate-500',
  }

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-5 py-2.5 text-base rounded-lg',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {icon && !loading && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

/* ===== CARDS ===== */
export function Card({ children, className = '', hover = false, ...props }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        light
          ? 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md'
          : 'border-white/[0.08] bg-slate-900/80 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/10'
      } ${
        hover
          ? light
            ? 'hover:border-slate-300 hover:shadow-md'
            : 'hover:border-white/[0.14] hover:bg-slate-900'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }) {
  const { theme } = useTheme()
  return (
    <div className={`px-5 py-4 border-b ${theme === 'light' ? 'border-slate-100' : 'border-white/[0.06]'} ${className}`}>
      {children}
    </div>
  )
}

export function CardBody({ children, className = '' }) {
  return <div className={`p-5 ${className}`}>{children}</div>
}

/* ===== INPUTS ===== */
export function Input({
  label,
  error,
  hint,
  icon,
  className = '',
  containerClassName = '',
  ...props
}) {
  const { theme } = useTheme()
  const light = theme === 'light'
  return (
    <div className={containerClassName}>
      {label && (
        <label className={`block text-sm font-medium mb-1.5 ${light ? 'text-slate-700' : 'text-slate-300'}`}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${light ? 'text-slate-400' : 'text-slate-500'}`}>
            {icon}
          </div>
        )}
        <input
          className={`
            w-full rounded-lg border px-3 py-2 text-sm
            transition-colors focus:outline-none
            ${icon ? 'pl-10' : ''}
            ${light
              ? `bg-white text-slate-900 placeholder:text-slate-400 ${
                  error
                    ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20'
                }`
              : `bg-slate-950/80 text-slate-100 placeholder:text-slate-500 ${
                  error
                    ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
                    : 'border-white/[0.1] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20'
                }`
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
      {hint && !error && <p className={`mt-1 text-xs ${light ? 'text-slate-500' : 'text-slate-500'}`}>{hint}</p>}
    </div>
  )
}

/* ===== BADGES ===== */
export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) {
  const variants = {
    default: 'bg-slate-800 text-slate-300 border-white/[0.06]',
    primary: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${
        variants[variant]
      } ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  )
}

/* ===== CONFIDENCE BADGE ===== */
export function ConfidenceBadge({ score }) {
  const getVariant = () => {
    if (score >= 0.95) return { variant: 'success', label: 'สูงมาก' }
    if (score >= 0.85) return { variant: 'success', label: 'สูง' }
    if (score >= 0.7) return { variant: 'warning', label: 'ปานกลาง' }
    return { variant: 'danger', label: 'ต่ำ' }
  }

  const { variant, label } = getVariant()

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Badge variant={variant} size="md">
          {label}
        </Badge>
        <span className="text-sm font-semibold text-slate-100 font-mono tabular-nums">
          {(score * 100).toFixed(1)}%
        </span>
      </div>
      <ConfidenceBar score={score} />
    </div>
  )
}

/* ===== CONFIDENCE BAR ===== */
export function ConfidenceBar({ score }) {
  const getColor = () => {
    if (score >= 0.95) return 'bg-emerald-500'
    if (score >= 0.85) return 'bg-emerald-400'
    if (score >= 0.7) return 'bg-amber-500'
    if (score >= 0.6) return 'bg-orange-500'
    return 'bg-red-500'
  }

  return (
    <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
        style={{ width: `${score * 100}%` }}
      />
    </div>
  )
}

/* ===== LOADING SPINNER ===== */
export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <svg
      className={`animate-spin text-blue-500 ${sizes[size]} ${className}`}
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

/* ===== SKELETON ===== */
export function Skeleton({ className = '', variant = 'rect' }) {
  const base = 'animate-pulse bg-white/[0.06] rounded-md'
  if (variant === 'circle') return <div className={`${base} rounded-full ${className}`} />
  if (variant === 'text') return <div className={`${base} h-4 ${className}`} />
  return <div className={`${base} ${className}`} />
}

export function SkeletonCard() {
  const { theme } = useTheme()
  const light = theme === 'light'
  return (
    <div className={`rounded-xl border overflow-hidden ${light ? 'border-slate-200 bg-white' : 'border-white/[0.08] bg-slate-900/80'}`}>
      <div className={`h-[2px] ${light ? 'bg-slate-200' : 'bg-white/[0.06]'}`} />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-8 w-28" variant="text" />
            <Skeleton className="h-3 w-20" variant="text" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl flex-shrink-0" />
        </div>
      </div>
    </div>
  )
}

/* ===== TOAST NOTIFICATION ===== */
export function Toast({ message, type = 'info', onClose }) {
  const types = {
    success: {
      bg: 'bg-emerald-500/15 border-emerald-500/25',
      text: 'text-emerald-200',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    error: {
      bg: 'bg-red-500/15 border-red-500/25',
      text: 'text-red-200',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    info: {
      bg: 'bg-blue-500/15 border-blue-500/25',
      text: 'text-blue-200',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  }

  const config = types[type] || types.info

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-[slideInRight_0.3s_ease-out] ${config.bg} ${config.text}`}
    >
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 text-sm font-medium">{message}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close notification"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ===== MODAL ===== */
export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${sizes[size]} rounded-xl border border-white/[0.08] bg-slate-900 shadow-2xl animate-[slideInUp_0.2s_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors rounded-md p-1 hover:bg-white/[0.06]"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

/* ===== STAT CARD ===== */
export function StatCard({ title, value, subtitle, trend, icon, accentColor = 'blue' }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const themes = {
    blue: {
      iconBg: 'bg-blue-500/10',
      iconRing: 'ring-blue-500/20',
      iconText: 'text-blue-400',
      glowFrom: 'from-blue-500/[0.07]',
      barBg: 'bg-blue-500',
      trendPositive: 'text-blue-400',
    },
    emerald: {
      iconBg: 'bg-emerald-500/10',
      iconRing: 'ring-emerald-500/20',
      iconText: 'text-emerald-400',
      glowFrom: 'from-emerald-500/[0.07]',
      barBg: 'bg-emerald-500',
      trendPositive: 'text-emerald-400',
    },
    amber: {
      iconBg: 'bg-amber-500/10',
      iconRing: 'ring-amber-500/20',
      iconText: 'text-amber-400',
      glowFrom: 'from-amber-500/[0.07]',
      barBg: 'bg-amber-500',
      trendPositive: 'text-amber-400',
    },
    red: {
      iconBg: 'bg-red-500/10',
      iconRing: 'ring-red-500/20',
      iconText: 'text-red-400',
      glowFrom: 'from-red-500/[0.07]',
      barBg: 'bg-red-500',
      trendPositive: 'text-red-400',
    },
    slate: {
      iconBg: 'bg-slate-500/10',
      iconRing: 'ring-slate-500/20',
      iconText: 'text-slate-400',
      glowFrom: 'from-slate-500/[0.07]',
      barBg: 'bg-slate-500',
      trendPositive: 'text-slate-400',
    },
  }

  const t = themes[accentColor] || themes.blue

  return (
    <div className={`group relative rounded-xl border overflow-hidden transition-all duration-300 ${
      light
        ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
        : 'border-white/[0.08] bg-slate-900/80 hover:border-white/[0.14] hover:shadow-lg hover:shadow-black/20'
    }`}>
      {/* Top accent bar */}
      <div className={`absolute top-0 inset-x-0 h-[2px] ${t.barBg} opacity-80`} />
      {/* Subtle radial glow */}
      <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${t.glowFrom} to-transparent blur-2xl pointer-events-none transition-opacity duration-300 opacity-0 group-hover:opacity-100`} />

      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${light ? 'text-slate-500' : 'text-slate-500'}`}>
              {title}
            </p>
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-extrabold tabular-nums tracking-tight ${light ? 'text-slate-900' : 'text-white'}`}>{value}</p>
            </div>
            {subtitle && (
              <p className={`mt-1 text-sm ${light ? 'text-slate-500' : 'text-slate-500'}`}>{subtitle}</p>
            )}
            {trend && (
              <div className="mt-2 flex items-center gap-1">
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    trend.positive
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  <svg
                    className={`h-3 w-3 ${trend.positive ? '' : 'rotate-180'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  {trend.value}
                </span>
              </div>
            )}
          </div>
          {icon && (
            <div className={`flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-xl ${t.iconBg} ring-1 ${t.iconRing} ${t.iconText} transition-transform duration-300 group-hover:scale-110`}>
              {icon}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===== EMPTY STATE ===== */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-slate-600">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-300 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mb-6 max-w-sm">{description}</p>
      )}
      {action}
    </div>
  )
}
