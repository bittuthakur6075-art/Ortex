import { CheckCircle2 } from "../../components/ui/Icons"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { cn } from "../../lib/cn"

// The enquiry pipeline as one clickable row: new to contacted to qualified to
// quoted, then won or lost. Every step writes straight back, so moving an
// enquiry along is a single tap rather than a form save.
export default function EnquiryStatusStepper({ status, onChange, disabled }) {
  const currentIndex = ENQUIRY_STATUS.findIndex((s) => s.id === status)
  const closed = status === "won" || status === "lost"

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Enquiry status">
      {ENQUIRY_STATUS.map((s, i) => {
        const active = s.id === status
        // "lost" never counts as progress towards "won", so only mark earlier
        // steps done while the enquiry is still on the happy path.
        const done = !active && currentIndex > i && !(closed && s.id === "won")
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            aria-current={active ? "step" : undefined}
            onClick={() => !active && onChange(s.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-60",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : done
                  ? "border-success/40 bg-success/10 text-success-text hover:bg-success/15"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {done && <CheckCircle2 className="h-3.5 w-3.5" />}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
