import { cn } from "../../lib/cn"

// Read-page building blocks shared by the category and work-photo detail
// drawers, in the same rhythm as ProductDetail: an uppercase caption over each
// block, label/value pairs, and a dashed well for "not set yet".

export function Section({ title, note, action, children }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {note && <span className="text-xs text-subtle-foreground">{note}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

export function Pair({ label, value, mono, className }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words font-medium text-foreground", mono && "tabular")}>{value}</dd>
    </div>
  )
}

export function Empty({ children }) {
  return (
    <p className="squircle rounded-[14px] border border-dashed border-border px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}

// A block of copy the website prints. Blank reads as the gap it is, never as
// an empty box.
export function Copy({ label, value, missing = "Not written yet" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {value ? (
        <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-foreground">{value}</p>
      ) : (
        <p className="mt-0.5 text-[13px] text-subtle-foreground">{missing}</p>
      )}
    </div>
  )
}
