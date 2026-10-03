import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowDownLeft as Chevron, Search, LayoutGrid } from "../ui/Icons"
import { Dot, TONE } from "../../pages/dashboard/parts"
import { initials } from "../../lib/format"
import { cn } from "../../lib/cn"

// The V2 list building blocks shared by Leads and Quotations, measured off the
// Figma frames "V2 · Leads · List" and "V2 · Quotations · List": smart views
// instead of stat cards and chip rails, one table card with a 58px toolbar,
// 34px head, 31px group rows and 56px rows, and quick actions kept visible.

/** Page title row: 24px semibold title, 13px summary, actions on the right. */
export function ListHeader({ title, summary, children }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-[29px] tracking-[-0.01em] text-foreground">{title}</h1>
        {summary && <p className="mt-1 text-[13px] leading-4 text-muted-foreground">{summary}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  )
}

/** A 36px round outline button with an 18px glyph (header tools). */
export function RoundTool({ icon: Icon, label, onClick, className }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn("grid h-9 w-9 flex-none place-items-center rounded-full border border-line bg-card text-muted-foreground transition-colors hover:text-primary", className)}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  )
}

/**
 * Smart views: one row of clickable tiles that are both the stats and the
 * saved filters. The active one is outlined in brand blue.
 */
export function SmartViews({ views, value, onChange, className = "md:grid-cols-3 xl:grid-cols-6" }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5", className)}>
      {views.map((v) => {
        const active = v.key === value
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(v.key)}
            aria-pressed={active}
            className={cn(
              "squircle flex min-w-0 flex-col gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
              active ? "border-primary bg-primary/[0.05]" : "border-transparent bg-card hover:border-line",
            )}
          >
            <span className="flex items-center gap-1.5">
              {v.tone && !active && <Dot tone={v.tone} size={7} />}
              <span className={cn("truncate text-xs font-medium leading-[15px]", active ? "text-primary" : "text-muted-foreground")}>{v.label}</span>
            </span>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className={cn("text-xl font-semibold leading-6 tabular", v.alert && !active ? TONE.rose.text : "text-foreground")}>{v.value}</span>
              {v.sub && <span className="truncate text-[11px] leading-[13px] text-muted-foreground">{v.sub}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The table card's search box: 34px, well fill, "/" hint. */
export const ListSearch = ({ inputRef, className, ...props }) => (
  <label className={cn("squircle flex h-[34px] w-full items-center gap-2 rounded-[10px] border border-line bg-muted px-3 md:w-[280px]", className)}>
    <Search className="h-[15px] w-[15px] flex-none text-subtle-foreground" />
    <input ref={inputRef} className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle-foreground" {...props} />
    <kbd className="flex-none text-[13px] text-subtle-foreground">/</kbd>
  </label>
)

/** A 34px outline toolbar button, "Filters 2" style. */
export function ToolButton({ icon: Icon = LayoutGrid, count, active, children, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "squircle inline-flex h-[34px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-2.5 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-primary/[0.05] text-primary" : "border-line bg-card text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      {children}
      {count > 0 && <span className="grid h-[13px] min-w-[19px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">{count}</span>}
    </button>
  )
}

/** An applied filter: "Owner: Me ×". */
export const FilterChip = ({ children, onClear }) => (
  <span className="squircle inline-flex h-[26px] flex-none items-center gap-1.5 rounded-lg bg-primary/[0.08] pl-2.5 pr-2 text-xs font-medium text-primary">
    {children}
    <button type="button" onClick={onClear} aria-label="Clear filter" className="text-[13px] leading-none hover:opacity-70">×</button>
  </span>
)

/** "Group Due ⌄" / "Sort Next step ⌄": a quiet native select. */
export function InlineSelect({ label, value, onChange, options }) {
  return (
    <label className="relative inline-flex flex-none items-center gap-[5px] px-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{options.find((o) => o.value === value)?.label}</span>
      <Chevron className="h-3 w-3 text-foreground" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

/** 16px checkbox, radius 5, brand fill when on. */
export function Check({ checked, onChange, label = "Select" }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        "grid h-4 w-4 flex-none place-items-center rounded-[5px] border text-[11px] font-bold leading-none",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-line bg-card",
      )}
    >
      {checked && "✓"}
    </button>
  )
}

/**
 * The keyboard (j/k) cursor: a 3px brand bar on the row's left edge, kept
 * apart from a ticked row's tint. Render inside the first cell, which must be
 * `relative`.
 */
export const CursorBar = ({ on }) => (on ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null)

/** A group divider inside the table: dot, name, count, a hint on the right. */
export function GroupRow({ tone, label, count, hint, colSpan }) {
  return (
    <tr className="bg-muted">
      {/* v2-body sizes every td for a 56px row; a group row is 31px. */}
      <td colSpan={colSpan} style={{ height: 31, padding: "8px 16px" }}>
        <div className="flex items-center gap-2 text-xs">
          <Dot tone={tone} size={8} />
          <span className="font-semibold text-foreground">{label}</span>
          <span className="font-medium text-muted-foreground tabular">{count}</span>
          {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
        </div>
      </td>
    </tr>
  )
}

/** Status as a coloured dot plus text; only risk carries colour elsewhere. */
export const StatusDot = ({ tone, children }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground">
    <Dot tone={tone} size={8} />
    {children}
  </span>
)

/** A small tag: 2×8 padding, fully round, 11px. Colour only for risk. */
export const Tag = ({ tone = "slate", children, className }) => (
  <span className={cn("inline-flex h-[17px] flex-none items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none", TONE[tone].soft, TONE[tone].text, className)}>{children}</span>
)

// Initials in a tinted disc; the tint is picked from the name so a person keeps
// one colour on every row.
const AVATAR_TONES = ["blue", "violet", "emerald", "amber", "rose"]
export function toneFor(name = "") {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

export function Initials({ name, size = 32, badge, className }) {
  const t = TONE[toneFor(name)]
  return (
    <span className={cn("relative inline-grid flex-none place-items-center rounded-full font-semibold", t.soft, t.text, className)} style={{ width: size, height: size, fontSize: size >= 30 ? 12 : 8 }}>
      {name ? initials(name) : "?"}
      {badge && (
        <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border border-line bg-card">{badge}</span>
      )}
    </span>
  )
}

/** A 28px round quick action. `href` renders a link. */
export function RowAction({ icon: Icon, label, href, external, onClick, tone, active, disabled }) {
  const cls = cn(
    "grid h-7 w-7 flex-none place-items-center rounded-full border bg-card transition-colors",
    active ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-primary/40",
    disabled && "pointer-events-none opacity-40",
    tone === "green" ? "text-success-text" : tone === "blue" ? "text-primary" : "text-muted-foreground",
  )
  const glyph = <Icon className="h-3.5 w-3.5" />
  const stop = (e) => e.stopPropagation()
  if (href && !disabled) {
    return (
      <a href={href} title={label} aria-label={label} className={cls} onClick={stop} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {glyph}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cls}
      disabled={disabled}
      onClick={(e) => {
        stop(e)
        onClick?.(e)
      }}
    >
      {glyph}
    </button>
  )
}

/**
 * The "···" menu: sections of actions, each with its keyboard shortcut, in a
 * 248px portal popover anchored under the button (a table's overflow would
 * clip it otherwise). `sections`: [{ title, items: [{ icon, label, hint, key,
 * danger, checked, keepOpen, onSelect }] }]. `keepOpen` leaves the menu up
 * after a pick, for multi-select filters.
 */
export function ActionMenu({ anchor, open, onClose, sections, width = 248 }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const r = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight || 380
    const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - 6 - h) : r.bottom + 6
    setPos({ top, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) })
  }, [open, anchor, width])

  useEffect(() => {
    if (!open) return
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose()
    }
    // Capture phase, so a key the menu handles never also reaches the list's
    // shortcuts (useListKeys) or the Escape of a panel underneath.
    const key = (e) => {
      const handled = () => {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (e.key === "Escape") return handled(), onClose()
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Only a letter takes the ⇧ prefix: "*" is typed with Shift already.
      const k = e.shiftKey && /^[a-z]$/i.test(e.key) ? `⇧${e.key.toUpperCase()}` : e.key.toUpperCase()
      const hit = sections.flatMap((s) => s.items).find((it) => it.key && !it.disabled && it.key.toUpperCase() === k)
      if (hit) {
        handled()
        if (!hit.keepOpen) onClose()
        hit.onSelect()
      }
    }
    const away = () => onClose()
    document.addEventListener("mousedown", down)
    window.addEventListener("keydown", key, true)
    window.addEventListener("scroll", away, true)
    return () => {
      document.removeEventListener("mousedown", down)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("scroll", away, true)
    }
  }, [open, onClose, anchor, sections])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="squircle fixed z-50 rounded-xl border border-line bg-card p-1.5 shadow-overlay-lg animate-pop-in"
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {sections.map((s, i) => (
        <div key={s.title || i}>
          {i > 0 && <div className="my-1 h-px bg-border" />}
          {s.title && <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{s.title}</p>}
          {s.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
              aria-checked={it.checked !== undefined ? !!it.checked : undefined}
              disabled={it.disabled}
              onClick={() => {
                if (!it.keepOpen) onClose()
                it.onSelect()
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-40",
                it.danger ? "text-destructive-text" : "text-foreground",
              )}
            >
              {it.pill ? (
                <span className="min-w-0 flex-1">
                  <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-bold uppercase tracking-[0.04em]", TONE[it.pill].soft, TONE[it.pill].text)}>{it.label}</span>
                </span>
              ) : (
                <>
                  {it.icon && <it.icon className={cn("h-4 w-4 flex-none", it.danger ? "text-destructive-text" : it.tone === "green" ? "text-success-text" : "text-muted-foreground")} />}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </>
              )}
              {it.checked && <span className="flex-none text-[13px] font-semibold text-primary">✓</span>}
              {it.hint && <span className="flex-none text-[11px] font-normal text-muted-foreground">{it.hint} ›</span>}
              {(it.key || it.keyHint) && <kbd className="grid h-[17px] min-w-5 flex-none place-items-center rounded-[5px] border border-line bg-background px-1.5 text-[10px] font-semibold text-muted-foreground">{it.key || it.keyHint}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/**
 * Jira-style status control: a lozenge in the status colour with a chevron,
 * opening the same lozenges as a list with the current one ticked.
 * `statuses`: [{ id, label }], `tones`: { id: tone }.
 */
// Solid, dark fills for the status button: white text stays readable on each.
const SOLID = {
  blue: "bg-primary-pressed",
  violet: "bg-info-text",
  emerald: "bg-success-text",
  amber: "bg-warning-text",
  orange: "bg-warning-text",
  rose: "bg-destructive-text",
  slate: "bg-secondary-foreground",
}

export function StatusDropdown({ value, statuses, tones, onChange, size = "md" }) {
  const [anchor, setAnchor] = useState(null)
  const cur = statuses.find((s) => s.id === value) || statuses[0]
  const solid = SOLID[tones[cur.id]] || SOLID.slate
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={cn(
          "inline-flex flex-none items-center gap-1.5 rounded-[999px] font-bold uppercase tracking-[0.04em] text-white transition-[filter] hover:brightness-110",
          size === "sm" ? "h-6 px-2.5 text-[10.5px]" : "h-8 px-3.5 text-[12px]",
          solid,
        )}
      >
        {cur.label}
        <Chevron className={cn("h-3.5 w-3.5 transition-transform", anchor && "rotate-180")} />
      </button>
      <ActionMenu open={!!anchor} anchor={anchor} onClose={() => setAnchor(null)} width={220} sections={statusSections(value, statuses, tones, onChange)} />
    </>
  )
}

export function statusSections(value, statuses, tones, onChange, title = "Change status") {
  const item = (s) => ({ icon: Chevron, label: s.label, pill: tones[s.id] || "slate", checked: s.id === value, onSelect: () => s.id !== value && onChange(s.id) })
  const open = statuses.filter((s) => s.id !== "lost")
  const lost = statuses.filter((s) => s.id === "lost")
  return [{ title, items: open.map(item) }, ...(lost.length ? [{ items: lost.map(item) }] : [])]
}

/**
 * Table footer: "Showing 1–25 of 559", rows per page, a pager, and the
 * keyboard shortcuts folded into one button instead of a sentence.
 * `shortcuts`: [[key, what], ...].
 */
export function Pager({ page, pageSize, total, noun = "rows", onPage, onPageSize, shortcuts }) {
  const [keysAt, setKeysAt] = useState(null)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(page * pageSize, total)
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
  const btn = "squircle grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-medium tabular transition-colors"
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span className="tabular">
        Showing <span className="font-semibold text-foreground">{from}–{to}</span> of <span className="font-semibold text-foreground">{total.toLocaleString("en-IN")}</span> {noun}
      </span>
      <label className="flex items-center gap-1.5">
        Rows
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="squircle h-8 cursor-pointer rounded-lg border border-line bg-card px-2 text-xs font-medium text-foreground outline-none focus:border-primary">
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-1">
        {shortcuts && (
          <button type="button" onClick={(e) => setKeysAt(keysAt ? null : e.currentTarget)} className="mr-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium hover:bg-muted hover:text-foreground">
            <kbd className="grid h-[18px] min-w-[18px] place-items-center rounded border border-line bg-background px-1 text-[10px] font-semibold">?</kbd>
            Shortcuts
          </button>
        )}
        {pages > 1 && (
          <>
            <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={cn(btn, "border border-line bg-card text-foreground hover:bg-muted disabled:opacity-40")}>
              ‹
            </button>
            {nums.map((p, i) => (
              <span key={p} className="contents">
                {i > 0 && nums[i - 1] !== p - 1 && <span className="px-0.5">…</span>}
                <button type="button" onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined} className={cn(btn, p === page ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
                  {p}
                </button>
              </span>
            ))}
            <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" className={cn(btn, "border border-line bg-card text-foreground hover:bg-muted disabled:opacity-40")}>
              ›
            </button>
          </>
        )}
      </div>
      {shortcuts && (
        <ActionMenu
          open={!!keysAt}
          anchor={keysAt}
          onClose={() => setKeysAt(null)}
          width={240}
          sections={[{ title: "Keyboard shortcuts", items: shortcuts.map(([k, what]) => ({ icon: null, label: what, keyHint: k, onSelect: () => {} })) }]}
        />
      )}
    </div>
  )
}

/** A plain footer: "25 of 559", a help line, and an optional "Load 25 more". */
export function ListFooter({ shown, total, help, onMore }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span className="truncate">
        {shown} of {total}
        {help ? ` · ${help}` : ""}
      </span>
      {onMore && (
        <button type="button" onClick={onMore} className="flex-none text-[13px] font-semibold text-primary hover:underline">
          Load 25 more
        </button>
      )}
    </div>
  )
}

// j/k to move, Enter to open, and single-letter row actions, ignored while
// typing in a field. `/` focuses the list search.
export function useListKeys(handlers, deps) {
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      // An open ActionMenu handles its own keys first and marks them handled.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest?.("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog]")) return
      const fn = handlers[e.key === "Enter" ? "Enter" : e.key.toLowerCase()]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
