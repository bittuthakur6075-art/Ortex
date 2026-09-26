import { Link } from "react-router-dom"
import { formatCurrency, initials } from "../../lib/format"
import { cn } from "../../lib/cn"

// The Dashboard's building blocks, measured off the Figma V2 frames
// ("Dashboard v2" page). One spacing scale: 24px around and between cards,
// 16/12px inside them. Radii step down as they nest: card 16 (rounded-card),
// tile 12 (rounded-xl), pill 10, and every rounded surface carries `squircle`
// so its corners are smoothed like Figma's 100% corner smoothing.

export const money = (v) => formatCurrency(v, { compact: true })

// Tone → the semantic classes a tinted well or pill needs.
export const TONE = {
  blue: { soft: "bg-primary/10", text: "text-primary", fill: "bg-primary" },
  violet: { soft: "bg-info/10", text: "text-info-text", fill: "bg-info" },
  emerald: { soft: "bg-success/12", text: "text-success-text", fill: "bg-success" },
  amber: { soft: "bg-warning/12", text: "text-warning-text", fill: "bg-warning" },
  orange: { soft: "bg-warning/12", text: "text-warning-text", fill: "bg-warning-text" },
  rose: { soft: "bg-destructive/10", text: "text-destructive-text", fill: "bg-destructive" },
  slate: { soft: "bg-background", text: "text-muted-foreground", fill: "bg-subtle-foreground/40" },
}

/** A dashboard card: 24px padding, 20px between blocks. */
export function Panel({ title, description, action, className, children, ...props }) {
  return (
    <section className={cn("squircle flex flex-col gap-5 rounded-card bg-card p-6", className)} {...props}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-5 tracking-[-0.01em] text-foreground">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-4 text-subtle-foreground">{description}</p>}
          </div>
          {action && <div className="flex flex-none items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function PanelLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-primary hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  )
}

export const Kicker = ({ children, className }) => (
  <p className={cn("text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-subtle-foreground", className)}>{children}</p>
)

/** Figma pill: 3px × 9px padding, radius 10, 11.5px medium. `size="md"` is the 12.5px header pill. */
export function Pill({ tone = "slate", size = "sm", className, children }) {
  const t = TONE[tone] || TONE.slate
  return (
    <span
      className={cn(
        "squircle inline-flex items-center gap-1 whitespace-nowrap rounded-[10px] px-[9px] py-[3px] font-medium",
        size === "md" ? "text-[12.5px] leading-[15px]" : "text-[11.5px] leading-[14px]",
        t.soft,
        t.text,
        className,
      )}
    >
      {children}
    </span>
  )
}

export const Dot = ({ tone = "slate", size = 8, className }) => (
  <span className={cn("flex-none rounded-full", (TONE[tone] || TONE.slate).fill, className)} style={{ width: size, height: size }} aria-hidden="true" />
)

/** A soft tile: 12px × 14px padding, radius 12, label 12 / value 20 (or 18) / sub 11.5. */
export function Tile({ label, value, sub, extra, valueSize = 20, className }) {
  return (
    <div className={cn("squircle flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl bg-subtle px-3.5 py-3", className)}>
      <div className="truncate text-xs font-medium leading-[15px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className="truncate font-semibold leading-none tracking-[-0.01em] text-foreground tabular" style={{ fontSize: valueSize }}>
          {value}
        </span>
        {extra}
      </div>
      {sub && <div className="truncate text-[11.5px] leading-[14px] text-subtle-foreground">{sub}</div>}
    </div>
  )
}

/** Up / down / no change against the previous window: 2px × 7px, radius 10, 11px semibold. */
export function Change({ d, unit = "%" }) {
  const base = "squircle inline-flex items-center whitespace-nowrap rounded-[10px] px-[7px] py-[2px] text-[11px] font-semibold leading-[14px] tabular"
  if (!d || d.dir === "flat") return <span className={cn(base, "bg-background text-muted-foreground")}>No change</span>
  const up = d.dir === "up"
  return <span className={cn(base, up ? "bg-success/12 text-success-text" : "bg-destructive/10 text-destructive-text")}>{up ? "↑" : "↓"} {d.pct == null ? "New" : `${Math.abs(d.pct)}${unit}`}</span>
}

/**
 * Figma's segmented switch: a chip-grey track (4px padding, radius 12) with
 * 6px × 12px options (radius 9); the active one sits on white.
 */
export function Seg({ items, value, onChange, className }) {
  return (
    <div className={cn("squircle inline-flex items-center gap-0.5 rounded-xl bg-[hsl(var(--table-head))] p-1", className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "squircle whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] leading-[15px] transition-colors",
              active ? "bg-card font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {it.count != null && ` ${it.count}`}
          </button>
        )
      })}
    </div>
  )
}

/** A bar split into weighted parts: 10px tall, 3px gaps, each part fully rounded. */
export function SplitBar({ parts, className }) {
  const shown = parts.filter((p) => p.value > 0)
  const total = shown.reduce((s, p) => s + p.value, 0)
  if (!total) return <div className={cn("h-2.5 rounded-full bg-background", className)} />
  return (
    <div className={cn("flex h-2.5 gap-[3px]", className)}>
      {shown.map((p) => (
        <span key={p.key} title={p.label} className={cn("h-full rounded-full", (TONE[p.tone] || TONE.slate).fill)} style={{ flex: `${p.value} 1 0%` }} />
      ))}
    </div>
  )
}

/** A thin progress track: 6px, radius 3. */
export function Track({ pct, tone = "blue", className, fillClassName }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-background", className)}>
      <div className={cn("h-full rounded-full", (TONE[tone] || TONE.blue).fill, fillClassName)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

/** Divided rows, for short label → value lists. */
export function Rows({ children, className }) {
  return <ul className={cn("divide-y divide-border", className)}>{children}</ul>
}
export function Row({ children, className }) {
  return <li className={cn("flex items-center gap-2.5 py-2.5 text-[13px] leading-4", className)}>{children}</li>
}

export const Initials = ({ name, tone = "slate", className }) => {
  const t = TONE[tone] || TONE.slate
  return <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-semibold", t.soft, t.text, className)}>{initials(name)}</span>
}

/** 14 thin bars, the last one solid: 6px wide, 3px apart, 28px tall. */
export function Spark({ values, tone = "blue" }) {
  const max = Math.max(...values, 0)
  const fill = tone === "rose" ? "bg-destructive" : "bg-primary"
  return (
    <div className="flex h-7 items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className={cn("w-1.5 rounded-[3px]", fill, i === values.length - 1 ? "" : "opacity-[0.22]")} style={{ height: `${max ? Math.max(6, Math.round((v / max) * 28)) : 6}px` }} />
      ))}
    </div>
  )
}

/**
 * The paired-bar chart from the Figma Cash flow card: a 32px value axis and,
 * per bucket, a light "invoiced" and a solid "collected" bar, 14px wide with
 * 5px top corners, 3px apart; the last label is bold.
 */
export function PairBars({ series, height = 220, format }) {
  const top = Math.max(1, ...series.flatMap((s) => [s.invoiced, s.collected]))
  const plot = height - 24
  const ticks = [top, (top * 2) / 3, top / 3, 0]
  return (
    <div className="flex gap-2" style={{ height }}>
      <div className="flex w-8 flex-none flex-col justify-between text-[11px] leading-[13px] text-subtle-foreground" style={{ height: plot }}>
        {ticks.map((t, i) => (
          <span key={i}>{i === 3 ? "0" : format(t)}</span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-end justify-between">
        {series.map((s, i) => (
          <div key={s.label} className="flex flex-col items-center gap-2" title={`${s.label}: invoiced ${format(s.invoiced)}, collected ${format(s.collected)}`}>
            <div className="flex items-end gap-[3px]" style={{ height: plot }}>
              <span className="w-3.5 rounded-t-[5px] bg-primary-soft" style={{ height: Math.max(2, (s.invoiced / top) * plot) }} />
              <span className={cn("w-3.5 rounded-t-[5px] bg-primary", i !== series.length - 1 && "opacity-90")} style={{ height: Math.max(2, (s.collected / top) * plot) }} />
            </div>
            <span className={cn("text-[11px] leading-[13px]", i === series.length - 1 ? "font-semibold text-foreground" : "text-subtle-foreground")}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
