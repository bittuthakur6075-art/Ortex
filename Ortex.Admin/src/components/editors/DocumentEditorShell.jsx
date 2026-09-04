import { ArrowLeft } from "../ui/Icons"
import { Card } from "../ui/Ui"
import { cn } from "../../lib/cn"

// Full-page editor chrome for quotations and invoices, modelled on the
// Keystone invoice details page: a record subheader (icon-only back circle,
// the number as the title, the trail beside it, the record's state as the one
// label on the row, actions right), then compact money tiles, then the body.

export function EditorHeader({ onBack, backLabel = "Back", title, trail = [], badge, meta, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          title={backLabel}
          aria-label={backLabel}
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-6 w-px bg-border" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-[20px] font-semibold leading-7 tracking-[-0.02em] text-foreground">{title}</h1>
            {trail.length > 0 && (
              <span className="hidden items-center gap-2 text-[13px] font-medium text-muted-foreground sm:flex">
                {trail.map((t, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true">•</span>}
                    {t}
                  </span>
                ))}
              </span>
            )}
            {badge}
          </div>
          {meta && <p className="mt-0.5 text-[13px] text-muted-foreground">{meta}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// Compact tile: 50px tinted icon disc beside the figure, label above it.
export function Tile({ icon: Icon, label, value, sub, tone = "primary", valueClassName }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success-text",
    warning: "bg-warning/12 text-warning-text",
    danger: "bg-destructive/10 text-destructive-text",
    info: "bg-info/10 text-info-text",
    slate: "bg-muted text-muted-foreground",
  }
  return (
    <Card className="flex items-center gap-4 p-4">
      {Icon && (
        <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-full", tones[tone] || tones.primary)}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">{label}</div>
        <div className={cn("mt-0.5 truncate text-[20px] font-semibold leading-6 tracking-[-0.02em] text-foreground tabular", valueClassName)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs font-medium text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  )
}

export function Tiles({ children, className }) {
  return <div className={cn("mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
}

// Section card with a titled header row, as on Keystone's record pages.
export function Section({ title, description, action, children, className, bodyClassName }) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex flex-none items-center gap-2">{action}</div>}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  )
}

// Sticky action bar at the foot of the editor.
export function EditorFooter({ left, right }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  )
}
