import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X, ArrowUpDown, Loader2 } from "./Icons"
import { cn } from "../../lib/cn"
import { statusMeta } from "../../data/domain/schema"
import { initials, formatCurrency } from "../../lib/format"

// The kit follows the Ortex Console design system (tokens in src/index.css):
// dense 36px controls, 8px corners, white cards with a hairline border and a
// whisper of shadow, one indigo brand hue used as ink and as low-alpha tints.

// ---- Button ----------------------------------------------------------------

// Primary is solid brand ink; "secondary" is a brand tint; outline is the
// workhorse for toolbars; ghost for icon-ish actions; danger is solid red.
const BTN_VARIANTS = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-pressed",
  accent: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-pressed",
  secondary: "bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20",
  outline: "border border-border bg-card text-foreground shadow-sm hover:bg-subtle hover:border-border-strong",
  ghost: "text-foreground hover:bg-muted",
  subtle: "bg-muted text-foreground hover:bg-border",
  danger: "bg-destructive-strong text-white shadow-sm hover:bg-destructive-text",
  dangerGhost: "text-destructive-text hover:bg-destructive/10",
  success: "bg-success text-white shadow-sm hover:opacity-90",
  dark: "bg-foreground text-background shadow-sm hover:opacity-90",
}

const BTN_SIZES = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-btn-sm",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-btn-sm",
  md: "h-9 px-3.5 text-sm gap-2 rounded-btn",
  lg: "h-10 px-4 text-sm gap-2 rounded-btn-lg",
  icon: "h-9 w-9 rounded-btn",
}

export function Button({ variant = "primary", size = "md", className, children, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,box-shadow] duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
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

// Square icon-only button used in toolbars and headers.
export function IconButton({ label, size = "md", className, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid place-items-center rounded-btn text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---- Card ------------------------------------------------------------------

// White surface, hairline border, 12px corners, 1px shadow.
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("card rounded-card bg-card shadow-card animate-card-in", className)} {...props}>
      {children}
    </div>
  )
}

// Card title row: 15px semibold title, optional description and right-side action.
export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  )
}

// ---- Badges ----------------------------------------------------------------

// Status pills: soft tint + AA-safe ink, 6px corners (Linear/Attio style).
const TONE = {
  blue: "bg-info/10 text-info-text",
  amber: "bg-warning/12 text-warning-text",
  violet: "bg-primary/10 text-primary",
  emerald: "bg-success/12 text-success-text",
  rose: "bg-destructive/10 text-destructive-text",
  cyan: "bg-info/10 text-info-text",
  slate: "bg-muted text-muted-foreground",
  outline: "border border-border bg-card text-muted-foreground",
}

export function Badge({ tone = "slate", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium leading-4",
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

// KPI tile: 13px label, 26px tabular value, optional delta and sub-line.
// `accent` keeps the old signature (icon disc tint) for existing callers.
export function StatCard({ icon: Icon, label, value, sub, accent = "bg-primary/10 text-primary", trend, className }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        {Icon && (
          <span className={cn("inline-grid h-8 w-8 flex-none place-items-center rounded-md", accent)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular">{value}</div>
      {(sub || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-subtle-foreground">
          {trend}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </Card>
  )
}

// Delta chip for StatCard.trend: positive / negative / neutral.
export function Delta({ value, suffix = "%", className }) {
  if (value == null || Number.isNaN(value)) return null
  const up = value > 0
  const flat = value === 0
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular",
        flat ? "bg-muted text-muted-foreground" : up ? "bg-success/12 text-success-text" : "bg-destructive/10 text-destructive-text",
        className,
      )}
    >
      {flat ? "" : up ? "▲ " : "▼ "}
      {Math.abs(value)}
      {suffix}
    </span>
  )
}

// ---- Avatar ----------------------------------------------------------------

export function Avatar({ name, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
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

// 36px field, 8px corner, white fill, hairline border; focus = brand border + soft ring.
const CONTROL =
  "w-full h-9 rounded-field border border-border bg-field px-3 text-sm leading-normal text-foreground shadow-sm transition-[border-color,box-shadow] duration-[120ms] placeholder:text-subtle-foreground hover:not-focus:not-disabled:border-border-strong focus:border-primary focus:ring-[3px] focus:ring-primary/15 focus:outline-none read-only:bg-subtle read-only:text-muted-foreground read-only:shadow-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/15"

export function Input({ className, ...props }) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(CONTROL, "h-auto min-h-[100px] resize-y py-2", className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(CONTROL, "cursor-pointer pr-9", className)} {...props}>
      {children}
    </select>
  )
}

export function Field({ label, hint, error, required, className, children }) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-[13px] font-medium text-foreground">
          {label} {required && <span className="text-destructive-text">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-subtle-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive-text">{error}</p>}
    </div>
  )
}

// Search input with a leading icon; used by list-page toolbars.
export function SearchInput({ icon: Icon, className, inputClassName, ...props }) {
  return (
    <div className={cn("relative", className)}>
      {Icon && <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />}
      <Input type="search" className={cn(Icon && "pl-8", inputClassName)} {...props} />
    </div>
  )
}

// ---- EmptyState ------------------------------------------------------------

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong bg-card/60 px-6 py-14 text-center", className)}>
      {Icon && (
        <span className="mb-3.5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h3 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
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

// ---- Tables ----------------------------------------------------------------

// Card-wrapped, horizontally scrollable data table. Pair with `table-console`.
export function TableWrap({ className, children }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  )
}

// Sortable header cell: inherits the `table-console` head style.
export function SortTh({ children, sortKey, sort, onSort, className, align = "left" }) {
  const active = sort?.key === sortKey
  return (
    <th className={cn("px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em]", align === "right" && "text-right", className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active ? "text-foreground" : "text-subtle-foreground")}
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

export function CloseButton({ onClick, className, label = "Close" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-8 w-8 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

// Dimmed scrim shared by overlays.
function Scrim({ onClick }) {
  return <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)] animate-fade-in" onClick={onClick} />
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <Scrim onClick={onClose} />
      <div className={cn("relative flex h-full w-full flex-col border-l border-border bg-card shadow-xl animate-drawer-in", width)}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {typeof title === "string" ? <h2 className="truncate text-base font-semibold text-foreground">{title}</h2> : title}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border bg-subtle/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <Scrim onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[calc(100vh-40px)] w-full flex-col overflow-hidden rounded-xl bg-card shadow-overlay-lg animate-pop-in",
          width,
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border bg-subtle/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---- Filter chips / segmented control --------------------------------------

// Toolbar chip: outlined at rest, filled dark when active.
export function Chip({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  )
}

// Segmented control: grouped options in one pill (period pickers, view toggles).
export function Segmented({ items, value, onChange, size = "sm", className }) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5", className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon && <it.icon className="h-3.5 w-3.5" />}
            {it.label}
            {it.count != null && (
              <span className={cn("rounded px-1 text-[10.5px] font-semibold tabular", active ? "bg-muted text-foreground" : "bg-card text-muted-foreground")}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---- Tabs ------------------------------------------------------------------

// Underline tabs: 2px ink bar under the active item, counts as small chips.
export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto border-b border-border", className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13.5px] transition-colors duration-[120ms]",
              active ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon && <it.icon className="h-4 w-4" />}
            {it.label}
            {it.count != null && (
              <span className={cn("rounded-md px-1.5 py-px text-[11px] font-semibold tabular", active ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground")}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---- Banner ----------------------------------------------------------------

const BANNER = {
  info: "border-info/30 bg-info/8 text-info-text",
  brand: "border-primary/25 bg-primary/6 text-primary-pressed",
  warning: "border-warning/40 bg-warning/10 text-warning-text",
  danger: "border-destructive/30 bg-destructive/8 text-destructive-text",
  success: "border-success/30 bg-success/8 text-success-text",
}

export function Banner({ tone = "info", className, children }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium", BANNER[tone] || BANNER.info, className)}>
      {children}
    </div>
  )
}

// ---- Misc ------------------------------------------------------------------

export function Kbd({ children, className }) {
  return <kbd className={cn("kbd", className)}>{children}</kbd>
}

// Key/value property row for detail panels (Attio-style).
export function PropertyRow({ label, children, className }) {
  return (
    <div className={cn("flex items-start gap-3 py-2 text-[13px]", className)}>
      <span className="w-28 flex-none text-subtle-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children ?? <span className="text-subtle-foreground">—</span>}</span>
    </div>
  )
}
