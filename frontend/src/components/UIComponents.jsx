import React from 'react'
import { X, AlertCircle, CheckCircle, Info, ChevronUp, ChevronDown } from 'lucide-react'

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
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface'

  const variants = {
    primary: 'bg-accent text-accent-content hover:bg-accent-hover shadow-sm focus:ring-accent',
    secondary: 'bg-surface-raised text-content border border-border hover:bg-surface-overlay focus:ring-accent',
    success: 'bg-success text-white hover:opacity-90 shadow-sm focus:ring-success',
    danger: 'bg-danger text-white hover:opacity-90 shadow-sm focus:ring-danger',
    ghost: 'text-content-secondary hover:bg-surface-overlay focus:ring-accent',
    warning: 'bg-warning text-white hover:opacity-90 shadow-sm focus:ring-warning',
  }

  const sizes = {
    xs: 'px-2.5 py-1 text-xs rounded-lg',
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-xl',
    lg: 'px-6 py-3 text-base rounded-xl',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {icon && !loading && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

/* ===== CARDS ===== */
export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface-raised shadow-sm ${hover ? 'hover:border-accent/30 hover:shadow-md transition-all' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`px-5 py-4 border-b border-border ${className}`}>
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
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-content-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-content
            transition-colors
            ${icon ? 'pl-10' : ''}
            ${error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-border focus:border-accent focus:ring-2 focus:ring-accent/20'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            placeholder:text-content-tertiary
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-danger flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-content-tertiary">{hint}</p>
      )}
    </div>
  )
}

/* ===== SELECT ===== */
export function Select({
  label,
  error,
  icon,
  className = '',
  containerClassName = '',
  children,
  ...props
}) {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-content-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary">
            {icon}
          </div>
        )}
        <select
          className={`
            w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-content
            transition-colors appearance-none
            ${icon ? 'pl-10' : ''}
            ${error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-border focus:border-accent focus:ring-2 focus:ring-accent/20'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-content-tertiary">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-danger flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
    </div>
  )
}

/* ===== BADGES ===== */
export function Badge({ children, variant = 'default', size = 'md', dot = false, className = '' }) {
  const variants = {
    default: 'bg-surface-overlay text-content-secondary',
    primary: 'bg-accent-muted text-accent',
    success: 'bg-success-muted text-success-content',
    warning: 'bg-warning-muted text-warning-content',
    danger: 'bg-danger-muted text-danger-content',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${variants[variant] || variants.default} ${sizes[size]} ${className}`}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

/* ===== CONFIDENCE BADGE ===== */
export function ConfidenceBadge({ score }) {
  const getVariant = () => {
    if (score >= 0.95) return { variant: 'success', label: 'Very High' }
    if (score >= 0.85) return { variant: 'success', label: 'High' }
    if (score >= 0.7) return { variant: 'warning', label: 'Medium' }
    return { variant: 'danger', label: 'Low' }
  }

  const { variant, label } = getVariant()

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Badge variant={variant} size="md">
          {label}
        </Badge>
        <span className="text-sm font-bold font-mono text-content">
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
    if (score >= 0.95) return 'bg-success'
    if (score >= 0.85) return 'bg-success'
    if (score >= 0.7) return 'bg-warning'
    if (score >= 0.6) return 'bg-warning'
    return 'bg-danger'
  }

  return (
    <div className="relative h-2 bg-surface-inset rounded-full overflow-hidden">
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
    xl: 'h-12 w-12',
  }

  return (
    <svg className={`animate-spin text-accent ${sizes[size]} ${className}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

/* ===== TOAST NOTIFICATION ===== */
export function Toast({ message, type = 'info', onClose }) {
  const types = {
    success: {
      bg: 'bg-success-muted border border-success/30',
      text: 'text-success-content',
      icon: <CheckCircle className="w-5 h-5" />,
    },
    error: {
      bg: 'bg-danger-muted border border-danger/30',
      text: 'text-danger-content',
      icon: <AlertCircle className="w-5 h-5" />,
    },
    info: {
      bg: 'bg-accent-muted border border-accent/30',
      text: 'text-accent',
      icon: <Info className="w-5 h-5" />,
    },
  }

  const config = types[type] || types.info

  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg animate-[slideInRight_0.3s_ease-out] ${config.bg} ${config.text}`}>
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 text-sm font-medium">{message}</div>
      {onClose && (
        <button onClick={onClose} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className={`w-full ${sizes[size]} rounded-2xl border border-border bg-surface-raised shadow-2xl animate-[slideUp_0.3s_ease-out] max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
            <h3 className="text-lg font-semibold text-content">{title}</h3>
            <button
              onClick={onClose}
              className="text-content-tertiary hover:text-content transition-colors rounded-lg p-1 hover:bg-surface-overlay"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-6 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

/* ===== STAT CARD ===== */
export function StatCard({ title, value, subtitle, trend, icon, className = '' }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-medium text-content-tertiary mb-1">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-content tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-sm text-content-secondary truncate">{subtitle}</p>
            )}
          </div>
          {trend && (
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
              {trend.positive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {trend.value}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center text-accent">
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ===== EMPTY STATE ===== */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 w-16 h-16 rounded-2xl bg-surface-overlay flex items-center justify-center text-content-tertiary">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-content mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-content-secondary mb-6 max-w-md">{description}</p>
      )}
      {action}
    </div>
  )
}

/* ===== DATA TABLE ===== */
export function DataTable({ columns, data, onSort, sortKey, sortDir, emptyMessage = 'No data found', className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary ${col.sortable ? 'cursor-pointer hover:text-content select-none' : ''} ${col.className || ''}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => col.sortable && onSort && onSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-content-tertiary">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-surface-overlay/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.cellClassName || ''}`}>
                    {col.render ? col.render(row[col.key], row, i) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ===== PAGINATION ===== */
export function Pagination({ page, totalPages, onPageChange, className = '' }) {
  if (totalPages <= 1) return null

  return (
    <div className={`flex items-center justify-between px-4 py-3 ${className}`}>
      <p className="text-sm text-content-secondary">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

/* ===== TOOLTIP ===== */
export function Tooltip({ children, text }) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs font-medium text-content-inverse bg-content rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-content" />
      </div>
    </div>
  )
}

/* ===== PAGE HEADER ===== */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-content">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-content-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
