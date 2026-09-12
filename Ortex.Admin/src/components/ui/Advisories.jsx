import { AlertTriangle, CheckCircle2, Clock, FileText, Info } from "./Icons"
import { cn } from "../../lib/cn"

// The advisory rail: a stack of sentences telling you what to do about this
// lead before you ring, from `lib/advisories.js`.
//
// Prose, not chips. The console already showed every underlying fact — the
// quantity, the age, the artwork state — as a value in a tile or a field, and
// a value is not a warning. "50,000" is a number; "confirm it, spoken figures
// like this are often a slip of the tongue" is a instruction, and it is the
// second one that changes what the caller says.

const TONE = {
  danger: "bg-destructive/10 text-destructive-text",
  warning: "bg-warning/12 text-warning-text",
  info: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success-text",
}

const ICON = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

// A couple of advisories read better with a glyph that names the subject rather
// than the severity.
const KEY_ICON = { stale: Clock, urgent: Clock, quoted: FileText }

export function Advisory({ tone = "info", icon, children, className }) {
  const Glyph = icon || ICON[tone] || Info
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-relaxed", TONE[tone] || TONE.info, className)}>
      <Glyph className="mt-0.5 h-4 w-4 flex-none" />
      <p>{children}</p>
    </div>
  )
}

export function Advisories({ items = [], className }) {
  if (!items.length) return null
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((a) => (
        <Advisory key={a.key} tone={a.tone} icon={KEY_ICON[a.key]}>
          {a.text}
        </Advisory>
      ))}
    </div>
  )
}
