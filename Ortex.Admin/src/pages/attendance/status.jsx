import { ArrowLeft, ArrowRight } from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"
import { STATUS_LABEL } from "../../lib/attendance"
import { cn } from "../../lib/cn"
import { shiftMonth } from "../../services/attendance"
import { monthLabel, STATUS_ORDER, toneFor } from "./format"

// Pieces for the phase 2 pages (Register, My attendance calendar): a day's
// status code as a tinted cell, the legend that explains the codes, and the
// month switcher. Tints come from the same semantic tokens as the Badge kit, so
// a status means the same colour everywhere.

export function StatusLegend({ className, codes = STATUS_ORDER }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground", className)}>
      {codes.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-grid h-5 min-w-7 place-items-center rounded px-1 text-[11px] font-semibold", toneFor(c))}>{c}</span>
          {STATUS_LABEL[c]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-warning" /> Late
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" /> Overridden
      </span>
    </div>
  )
}

export function MonthSwitcher({ month, onChange, max }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" icon aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[150px] text-center text-base font-semibold text-foreground">{monthLabel(month)}</span>
      <Button
        size="sm"
        variant="outline"
        icon
        aria-label="Next month"
        disabled={Boolean(max) && month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
