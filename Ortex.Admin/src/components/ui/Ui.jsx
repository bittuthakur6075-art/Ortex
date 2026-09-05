import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, ArrowUpDown, ArrowDownLeft, CheckCircle2, Loader2, Search, Download } from "./Icons"
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

// Three sizes, and only three. Height, text size, weight and radius are fixed
// per size — pass `size`, never override them from a page:
//   sm  30px · 12px/500 · r12 · pad 7/14
//   md  40px · 14px/600 · r16 · pad 10/20   (default)
//   lg  50px · 16px/600 · r20 · pad 13/26
// Padding follows one rule: vertical = (height - line-height) / 2, horizontal =
// exactly 2x that. So the padding alone already adds up to the stated height
// (7+16+7 = 30, 10+20+10 = 40, 13+24+13 = 50) and h-[] only pins it against a
// taller child.
// Every button also carries `squircle` (corner-shape: squircle), so the corners
// curve continuously rather than as plain circular arcs.
const BTN_SIZES = {
  sm: "h-[30px] px-[14px] py-[7px] gap-1.5 text-xs font-medium rounded-btn-sm",
  md: "h-10 px-[20px] py-[10px] gap-2 text-sm font-semibold rounded-btn-md",
  lg: "h-[50px] px-[26px] py-[13px] gap-2.5 text-base font-semibold rounded-btn-lg",
}

// Icon-only buttons keep the same heights and radii, trading padding for a
// square footprint. Set `icon` on Button instead of reaching for a 4th size.
const BTN_ICON_SIZES = {
  sm: "h-[30px] w-[30px] gap-0 text-xs font-medium rounded-btn-sm",
  md: "h-10 w-10 gap-0 text-sm font-semibold rounded-btn-md",
  lg: "h-[50px] w-[50px] gap-0 text-base font-semibold rounded-btn-lg",
}

function btnSize(size, icon) {
  const scale = icon ? BTN_ICON_SIZES : BTN_SIZES
  return scale[size] || scale.md
}

export function Button({ variant = "primary", size = "md", icon = false, squircle = true, className, children, ...props }) {
  return (
    <button
      className={cn(
        squircle && "squircle",
        "inline-flex items-center justify-center whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        BTN_VARIANTS[variant],
        btnSize(size, icon),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// Icon-only action: a 45px white disc that tints brand on hover. The glyph uses
// the Bold variant so a wordless control still reads as actionable.
export function IconButton({ icon: Icon, label, className, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid h-[45px] w-[45px] flex-none place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon variant="Bold" className="h-5 w-5" /> : children}
    </button>
  )
}

// ---- Card ------------------------------------------------------------------

// rounded-xl · border · shadow-xs, as Metronic's `card`.
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("card squircle flex flex-col rounded-card bg-card text-card-foreground shadow-card", className)} {...props}>
      {children}
    </div>
  )
}

// Card header: an even 20px of padding on all four sides, so the gap above and
// below the action button matches the gap between it and the card's edge;
// bottom hairline; 18px semibold tight-tracked title.
export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2.5 border-b border-border p-5", className)}>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold leading-none tracking-tight text-foreground">{title}</h3>
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

// Status pills read as a fixed vocabulary rather than prose: 22px tall, fully
// rounded, 12px uppercase. The tone colour carries the meaning, so there is no
// leading dot.
export function StatusBadge({ list, status, className }) {
  const meta = statusMeta(list, status)
  return (
    <Badge tone={meta.tone} className={cn("h-[22px] rounded-full px-2 text-xs uppercase tracking-wide", className)}>
      {meta.label}
    </Badge>
  )
}

// ---- StatCard --------------------------------------------------------------

// Metronic stat tile: icon top-left, big number, muted label underneath.
export function StatCard({ icon: Icon, label, value, accent = "bg-primary/10 text-primary", className }) {
  return (
    <Card className={cn("flex-row items-center gap-2.5 rounded-[24px]! squircle p-5", className)}>
      {Icon && (
        <span className={cn("inline-grid h-[46px] w-[46px] flex-none place-items-center rounded-full", accent)}>
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
        <span className="text-base font-semibold leading-none tracking-tight text-foreground tabular">{value}</span>
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

// `src` is the uploaded profile photo (profiles.avatar_url); without one the
// circle falls back to the person's initials.
export function Avatar({ name, src, className }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "Profile photo"}
        loading="lazy"
        className={cn("inline-block h-9 w-9 flex-none rounded-full bg-muted object-cover", className)}
      />
    )
  }
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
// 45px tall, 16px squircle corners — the same shape language as the cards.
const CONTROL =
  "w-full h-[45px] rounded-[16px] squircle border border-input bg-field px-3.5 text-[13px] leading-normal text-foreground shadow-sm transition-[border-color,box-shadow] duration-[120ms] placeholder:text-subtle-foreground hover:not-focus:not-disabled:border-border-strong focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none read-only:bg-subtle read-only:text-muted-foreground read-only:shadow-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20"

export function Input({ className, ...props }) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(CONTROL, "h-auto min-h-[100px] resize-y py-2", className)} {...props} />
}

// Select is a listbox of our own rather than a native <select>, because the
// browser draws the native popup with OS chrome — a blue highlight bar and
// square corners that belong to no design system. The API is unchanged: pass
// <option> children and a value/onChange pair, and onChange receives an event
// shaped like the native one, so existing call sites need no edits.
//
// The menu renders in a portal and is positioned against the trigger's viewport
// rect. Absolute positioning would be simpler, but several Selects live inside
// scroll containers (the line-items grid, drawers) that would clip the popup.
export function Select({ className, children, value, onChange, disabled, placeholder, ...props }) {
  const options = useMemo(() => collectOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [rect, setRect] = useState(null)

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value ?? ""))
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const measure = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    // Flip above when the space underneath can't hold a usable list.
    const flip = below < 200 && r.top > below
    setRect({ left: r.left, width: r.width, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, flip })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    const onMove = () => measure()
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onDown = (ev) => {
      if (triggerRef.current?.contains(ev.target) || menuRef.current?.contains(ev.target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const commit = (opt) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (!opt || opt.disabled || String(opt.value) === String(value ?? "")) return
    onChange?.({ target: { value: opt.value } })
  }

  const step = (dir) => {
    if (!options.length) return
    let i = highlight < 0 ? selectedIndex : highlight
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) break
    }
    setHighlight(i)
  }

  const onKeyDown = (ev) => {
    if (disabled) return
    if (!open && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(ev.key)) {
      ev.preventDefault()
      setHighlight(selectedIndex)
      setOpen(true)
      return
    }
    if (!open) return
    if (ev.key === "Escape") { ev.preventDefault(); setOpen(false) }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); step(1) }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); step(-1) }
    else if (ev.key === "Home") { ev.preventDefault(); setHighlight(options.findIndex((o) => !o.disabled)) }
    else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); commit(options[highlight] ?? selected) }
    else if (ev.key === "Tab") setOpen(false)
  }

  const label = selected ? selected.label : placeholder || ""

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => { if (!disabled) { setHighlight(selectedIndex); setOpen((o) => !o) } }}
        onKeyDown={onKeyDown}
        className={cn(CONTROL, "flex cursor-pointer items-center justify-between gap-2 pr-3 text-left", open && "border-ring ring-2 ring-ring/30", className)}
        {...props}
      >
        <span className={cn("truncate", !selected && "text-subtle-foreground")}>{label}</span>
        <ArrowDownLeft variant="Linear" className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...(rect.flip ? { bottom: rect.bottom } : { top: rect.top }),
          }}
          className="squircle z-[60] max-h-64 overflow-y-auto rounded-[16px] border border-border bg-card p-1.5 shadow-overlay-lg scroll-thin animate-pop-in"
        >
          {options.length === 0 && <p className="px-3 py-2 text-[13px] text-muted-foreground">No options</p>}
          {options.map((o, i) => {
            const isSelected = String(o.value) === String(value ?? "")
            return (
              <button
                key={`${o.value}-${i}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={o.disabled}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
                className={cn(
                  "squircle flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  isSelected ? "bg-primary/10 font-medium text-primary" : "text-foreground",
                  highlight === i && !o.disabled && !isSelected && "bg-accent",
                )}
              >
                <span className="truncate">{o.label}</span>
                {isSelected && <CheckCircle2 className="h-4 w-4 flex-none" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

// Flatten <option> children (including those inside arrays and fragments) into
// { value, label, disabled }. Anything that isn't an <option> is ignored.
function collectOptions(children, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === "option") {
      out.push({
        value: child.props.value ?? "",
        label: childText(child.props.children),
        disabled: Boolean(child.props.disabled),
      })
    } else if (child.props?.children) {
      collectOptions(child.props.children, out)
    }
  })
  return out
}

function childText(node) {
  if (node == null || node === false) return ""
  if (Array.isArray(node)) return node.map(childText).join("")
  if (isValidElement(node)) return childText(node.props.children)
  return String(node)
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
//
// The clear cross is ours, not the browser's: Chrome's native search-cancel
// button is hidden in index.css and replaced with the Iconsax bulk cross, which
// matches the rest of the icon set and can carry a hover colour. It only
// appears once there is something to clear. Callers already pass value +
// onChange, so clearing synthesises the same event rather than needing a new
// prop — `onClear` is there for the odd caller that needs to do more.
export function SearchInput({ className, inputClassName, onClear, ...props }) {
  const hasValue = String(props.value ?? "").length > 0
  const clear = () => {
    if (onClear) return onClear()
    props.onChange?.({ target: { value: "" } })
  }
  return (
    <div className={cn("group relative", className)}>
      <span className="pointer-events-none absolute left-4 top-1/2 grid -translate-y-1/2 place-items-center text-muted-foreground transition-colors group-focus-within:text-primary">
        <Search variant="Linear" className="h-[18px] w-[18px]" />
      </span>
      <Input
        type="search"
        className={cn(
          "h-[45px] rounded-full border-border pl-11 text-sm shadow-none",
          "placeholder:text-sm placeholder:font-medium placeholder:text-muted-foreground",
          "focus:border-border focus:ring-0",
          hasValue && "pr-11",
          inputClassName,
        )}
        {...props}
      />
      {hasValue && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 grid -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:text-danger-hover"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>
  )
}

// List-page toolbars sit beside a 45px squircle search pill, so their controls
// match it rather than the three standard button sizes: same height, same 18px
// squircle corner. Kept here as named components because pages must never
// hand-roll a height or radius (see CLAUDE.md).
const TOOLBAR_SHAPE = "h-[45px] rounded-[18px] squircle"

export function ToolbarButton({ variant = "outline", className, children, ...props }) {
  return (
    <Button variant={variant} className={cn(TOOLBAR_SHAPE, "flex-none px-5 text-sm font-medium", className)} {...props}>
      {children}
    </Button>
  )
}

// Export control shared by every list page: a square white button carrying the
// 20px bold download icon, no label. The fill stays white on hover — only the
// icon changes, muted to primary, the same way a sidebar nav icon behaves. One
// component so the list toolbars can't drift apart.
export function ExportButton({ label = "Export CSV", className, ...props }) {
  return (
    <Button
      variant="outline"
      aria-label={label}
      title={label}
      icon
      className={cn("group flex-none bg-card hover:bg-card", TOOLBAR_SHAPE, "w-[45px] p-0", className)}
      {...props}
    >
      <Download variant="Bold" className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
    </Button>
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
        <ArrowUpDown variant="Linear" className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-50")} />
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
          <button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)} className="squircle grid h-[30px] w-[30px] place-items-center rounded-btn-sm text-foreground hover:bg-accent disabled:opacity-40">
            ‹
          </button>
          {pages.map((p, i) => (
            <span key={p} className="contents">
              {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1">…</span>}
              <button type="button" onClick={() => onPage?.(p)} className={cn("squircle grid h-[30px] min-w-[30px] place-items-center rounded-btn-sm px-2 text-xs tabular hover:bg-accent", p === page && "bg-accent font-medium text-foreground")}>
                {p}
              </button>
            </span>
          ))}
          <button type="button" disabled={page >= pageCount} onClick={() => onPage?.(page + 1)} className="squircle grid h-[30px] w-[30px] place-items-center rounded-btn-sm text-foreground hover:bg-accent disabled:opacity-40">
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
        "squircle grid h-[30px] w-[30px] flex-none place-items-center rounded-btn-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <X variant="Linear" className="h-[18px] w-[18px]" />
    </button>
  )
}

// Dimmed scrim shared by overlays.
function Scrim({ onClick }) {
  return <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClick} />
}

// `bodyClassName` overrides the scrolling area's padding. A full-bleed drawer
// wants "p-0": with the default p-5 a sticky child positioned at top-0 sticks to
// the padding edge, leaving a 20px strip above it where the list scrolls through.
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-lg", bodyClassName }) {
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
        <div className={cn("scroll-thin flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
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
        "inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-secondary-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  )
}

// Track for a row of Chips: one white 45px pill holding the 40px options.
export function ChipGroup({ className, children }) {
  return <div className={cn("inline-flex h-[45px] max-w-full items-center gap-1 overflow-x-auto rounded-full bg-card px-[5px]", className)}>{children}</div>
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
            {it.icon && <it.icon className={cn("h-4 w-4 flex-none", active ? "text-primary" : "text-muted-foreground")} />}
            {it.label}
            {it.count != null && (
              <span className={cn("rounded-full px-1.5 py-px text-[11px] font-medium tabular", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{it.count}</span>
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
      <span className="min-w-0 flex-1 text-foreground">{children ?? <span className="text-subtle-foreground">-</span>}</span>
    </div>
  )
}
