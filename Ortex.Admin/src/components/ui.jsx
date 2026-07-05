import { useEffect } from "react"
import { X, ArrowUpDown, Loader2 } from "./icons"
import { cn } from "../lib/cn"
import { statusMeta } from "../data/schema"
import { initials, formatCurrency } from "../lib/format"

// ---- Button ----------------------------------------------------------------

const BTN_VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  dangerGhost: "text-destructive hover:bg-destructive/10",
  success: "bg-[hsl(var(--success))] text-white hover:opacity-90",
}

const BTN_SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9",
}

export function Button({ variant = "primary", size = "md", className, children, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---- Card ------------------------------------------------------------------

export function Card({ className, children, ...props }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)} {...props}>
      {children}
    </div>
  )
}

// ---- Badges ----------------------------------------------------------------

const TONE = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
}

export function Badge({ tone = "slate", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONE[tone] || TONE.slate,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ list, status, dot = true, className }) {
  const meta = statusMeta(list, status)
  return (
    <Badge tone={meta.tone} className={className}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {meta.label}
    </Badge>
  )
}

// ---- StatCard --------------------------------------------------------------

export function StatCard({ icon: Icon, label, value, sub, accent = "bg-primary/10 text-primary", trend }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", accent)}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular">{value}</div>
      {(sub || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {trend}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </Card>
  )
}

// ---- Avatar ----------------------------------------------------------------

export function Avatar({ name, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

// ---- Money -----------------------------------------------------------------

export function Money({ value, className, compact = false }) {
  return <span className={cn("tabular", className)}>{formatCurrency(value, { compact })}</span>
}

// ---- Form controls ---------------------------------------------------------

const CONTROL =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none disabled:opacity-60"

export function Input({ className, ...props }) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(CONTROL, "min-h-[90px] resize-y", className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(CONTROL, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  )
}

export function Field({ label, hint, error, required, className, children }) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ---- EmptyState ------------------------------------------------------------

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} />
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

// ---- Sortable table header -------------------------------------------------

export function SortTh({ children, sortKey, sort, onSort, className, align = "left" }) {
  const active = sort?.key === sortKey
  return (
    <th className={cn("px-4 py-3 font-medium", align === "right" && "text-right", className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {children}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  )
}

// ---- Overlays: Drawer + Modal ----------------------------------------------

function useEscape(onClose, active) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, active])
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }) {
  useEscape(onClose, open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-in" onClick={onClose} />
      <div className={cn("relative flex h-full w-full flex-col border-l border-border bg-card", width)}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            {typeof title === "string" ? <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2> : title}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="flex-none rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }) {
  useEscape(onClose, open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn("relative flex max-h-[90vh] w-full flex-col rounded-2xl border border-border bg-card", width)}>
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

// ---- Filter chips ----------------------------------------------------------

export function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}
