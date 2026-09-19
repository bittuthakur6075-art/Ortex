import { Badge } from "../../../components/ui/Ui"
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE } from "../../../lib/attendance"
import { cn } from "../../../lib/cn"
import { typeTone } from "./common"

// The two small marks the Leave pages share: a request's status and a leave
// type's coloured code.

export function LeaveStatusBadge({ status }) {
  return <Badge tone={LEAVE_STATUS_TONE[status] || "slate"}>{LEAVE_STATUS_LABEL[status] || status}</Badge>
}

export function TypeChip({ code, className }) {
  return (
    <span className={cn("inline-grid h-5 min-w-9 place-items-center rounded px-1.5 text-[11px] font-semibold", typeTone(code), className)}>
      {code}
    </span>
  )
}
