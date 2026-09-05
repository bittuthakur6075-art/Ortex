import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X, ArrowUpDown, Loader2 } from "./Icons"
import { cn } from "../../lib/cn"
import { statusMeta } from "../../data/domain/schema"
import { initials, formatCurrency } from "../../lib/format"

// The kit follows Metronic 9 Demo 1 (tokens in src/index.css): white surfaces,
// zinc neutrals, blue-500 primary, 34px controls with 6px corners, 12px cards
// with a hairline and a 1px/2px 5% shadow, 13–14px UI text in the system sans.

// ---- Button ----------------------------------------------------------------

const BTN_VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
  accent: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
  secondary: "bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20",
  outline: "border border-input bg-card text-foreground shadow-sm hover:bg-accent",
  ghost: "text-foreground hover:bg-accent",
  subtle: "bg-accent text-foreground hover:bg-border-strong/60",
  danger: "bg-destructive-strong text-white hover:bg-destructive-text",
  dangerGhost: "text-destructive-text hover:bg-destructive/10",
  success: "bg-success text-white hover:opacity-90",
  dark: "bg-foreground text-background hover:opacity-90",
}

// Metronic sizes: sm 30px · md 34px · lg 40px, 6px radius.
const BTN_SIZES = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-btn-sm",
  sm: "h-[30px] px-3 text-[13px] gap-1.5 rounded-btn-sm",
  md: "h-[34px] px-3.5 text-[13px] gap-2 rounded-btn",
  lg: "h-10 px-4 text-sm gap-2 rounded-btn-lg",
  icon: "h-[34px] w-[34px] rounded-btn",
}

export function Button({ variant = "primary", size = "md", className, children, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
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

// Square icon-only button (header actions, row menus).
export function IconButton({ label, size = "md", className, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid place-items-center rounded-btn text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 w-8" : "h-[34px] w-[34px]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---- Card ------------------------------------------------------------------

// rounded-xl · border · shadow-xs, as Metronic's `card`.
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("card flex flex-col rounded-card border border-border bg-card text-card-foreground shadow-card", className)} {...props}>
      {children}
    </div>
  )
}

// Metronic `card-header`: 56px min-height, 20px side padding, bottom hairline,
// 16px semibold tight-tracked title.
export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn("flex min-h-14 flex-wrap items-center justify-between gap-2.5 border-b border-border px-5 py-3", className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">{title}</h3>
        {description && <p className="mt-1.5 text-[13px] leading-4 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-none items-center gap-2.5">{action}</div>}
    </div>
  )
}

// Metronic `card-footer`: centered link or actions above a top hairline.
export function CardFooter({ className, children }) {
  return <div className={cn("flex items-center justify-center gap-2.5 border-t border-border px-5 py-3.5", className)}>{children}</div>
}

// ---- Badges ----------------------------------------------------------------

// Metronic light badges: 10% tint + solid text of the same hue, 4px corners,
// 11px medium. Tone names are kept for statusMeta compatibility.
const TONE = {
  blue: "bg-primary/10 text-primary",
  amber: "bg-warning/12 text-warning-text",
  violet: "bg-info/10 text-info-text",
  emerald: "bg-success/12 text-success-text",
  rose: "bg-destructive/10 text-destructive-text",
  cyan: "bg-primary/10 text-primary",
  slate: "bg-secondary text-secondary-foreground",
  outline: "border border-border bg-card text-muted-foreground",
}

export function Badge({ tone = "slate", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium leading-3",
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
    <Badge tone={meta.tone} className={cn("h-[22px] px-2 text-xs", className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {meta.label}
    </Badge>
  )
}

// ---- StatCard --------------------------------------------------------------

// Metronic stat tile: icon top-left, big number, muted label underneath.
export function StatCard({ icon: Icon, label, value, sub, accent = "bg-primary/10 text-primary", trend, className }) {
  return (
    <Card className={cn("justify-between gap-5 px-5 pb-4 pt-5", className)}>
      {Icon && (
        <span className={cn("inline-grid h-8 w-8 flex-none place-items-center rounded-md", accent)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-foreground tabular">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
        {(sub || trend) && (
          <span className="flex items-center gap-2 text-xs text-subtle-foreground">
            {trend}
            {sub}
          </span>
        )}
      </div>
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
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium tabular",
        flat ? "bg-secondary text-secondary-foreground" : up ? "bg-success/12 text-success-text" : "bg-destructive/10 text-destructive-text",
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
        "inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
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

// Metronic input: 34px, 6px corner, zinc-200 border, xs shadow, 13px; focus =
// ring-2 in the muted ring colour.
const CONTROL =
  "w-full h-[34px] rounded-field border border-input bg-field px-3 text-[13px] leading-normal text-foreground shadow-sm transition-[border-color,box-shadow] duration-[120ms] placeholder:text-subtle-foreground hover:not-focus:not-disabled:border-border-strong focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none read-only:bg-subtle read-only:text-muted-foreground read-only:shadow-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20"

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
        <label className="mb-1.5 block text-sm font-normal text-foreground">
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
    <div className={cn("flex flex-col items-center justify-center rounded-card border border-dashed border-input bg-card px-6 py-14 text-center", className)}>
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

// Card-wrapped, horizontally scrollable data table. Pair with `mt-head` /
// `mt-body` (index.css) for the Metronic grid look.
export function TableWrap({ className, children }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  )
}

// Sortable header cell for `mt-head` tables: 14px regular with a sort glyph.
export function SortTh({ children, sortKey, sort, onSort, className, align = "left" }) {
  const active = sort?.key === sortKey
  return (
    <th className={cn(align === "right" && "text-right", className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1.5 transition-colors hover:text-foreground", active ? "text-foreground" : "text-secondary-foreground")}
      >
        {children}
        <ArrowUpDown className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-50")} />
      </button>
    </th>
  )
}

// Metronic table footer: rows-per-page left, "1 - 5 of 15" + pager right.
export function TableFooter({ page = 1, pageCount = 1, total = 0, pageSize = 10, onPage, className }) {
  if (!total) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => Math.abs(p - page) <= 1 || p === 1 || p === pageCount)
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] text-muted-foreground", className)}>
      <span>
        Rows per page <span className="ml-1 inline-flex h-8 items-center rounded-btn border border-input bg-card px-2.5 text-foreground shadow-sm">{pageSize}</span>
      </span>
      <div className="flex items-center gap-2.5">
        <span className="tabular">
          {from} - {to} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)} className="grid h-8 w-8 place-items-center rounded-btn text-foreground hover:bg-accent disabled:opacity-40">
            ‹
          </button>
          {pages.map((p, i) => (
            <span key={p} className="contents">
              {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1">…</span>}
              <button type="button" onClick={() => onPage?.(p)} className={cn("grid h-8 min-w-8 place-items-center rounded-btn px-2 text-[13px] tabular hover:bg-accent", p === page && "bg-accent font-medium text-foreground")}>
                {p}
              </button>
            </span>
          ))}
          <button type="button" disabled={page >= pageCount} onClick={() => onPage?.(page + 1)} className="grid h-8 w-8 place-items-center rounded-btn text-foreground hover:bg-accent disabled:opacity-40">
            ›
          </button>
        </div>
      </div>
    </div>
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
        "grid h-8 w-8 flex-none place-items-center rounded-btn text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

// Dimmed scrim shared by overlays.
function Scrim({ onClick }) {
  return <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClick} />
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <Scrim onClick={onClose} />
      <div className={cn("relative flex h-full w-full flex-col border-l border-border bg-card shadow-xl animate-drawer-in", width)}>
        <div className="flex min-h-14 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {typeof title === "string" ? <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h2> : title}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3.5">{footer}</div>}
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
          "relative flex max-h-[calc(100vh-40px)] w-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-overlay-lg animate-pop-in",
          width,
        )}
      >
        {title && (
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---- Filter chips / segmented control --------------------------------------

// Metronic filter toggle: an outline button that fills blue when active.
export function Chip({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-btn border px-3 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground shadow-sm hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  )
}

// Segmented control (Metronic tab-toggle): options in one bordered pill.
export function Segmented({ items, value, onChange, size = "sm", className }) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-btn border border-input bg-card p-0.5 shadow-sm", className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-[30px] px-3 text-[13px]",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon && <it.icon className="h-3.5 w-3.5" />}
            {it.label}
            {it.count != null && (
              <span className={cn("rounded px-1 text-[10.5px] font-semibold tabular", active ? "bg-card text-foreground" : "bg-accent text-muted-foreground")}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---- Tabs ------------------------------------------------------------------

// Metronic tabs: 14px medium, blue text + 2px blue underline when active.
export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cn("flex items-center gap-6 overflow-x-auto border-b border-border", className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 text-sm font-medium transition-colors duration-[120ms]",
              active ? "border-primary text-primary" : "border-transparent text-foreground hover:text-primary",
            )}
          >
            {it.icon && <it.icon className="h-4 w-4" />}
            {it.label}
            {it.count != null && (
              <span className={cn("rounded px-1.5 py-px text-[11px] font-medium tabular", active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---- Banner ----------------------------------------------------------------

const BANNER = {
  info: "border-primary/25 bg-primary/8 text-primary",
  brand: "border-primary/25 bg-primary/8 text-primary",
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

// Key/value property row for detail panels: label column like Metronic forms.
export function PropertyRow({ label, children, className }) {
  return (
    <div className={cn("flex items-start gap-3 py-2 text-sm", className)}>
      <span className="w-40 flex-none text-secondary-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children ?? <span className="text-subtle-foreground">—</span>}</span>
    </div>
  )
}
