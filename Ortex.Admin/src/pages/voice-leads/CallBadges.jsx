import { AlertTriangle, Clock } from "../../components/ui/Icons"
import { Badge } from "../../components/ui/Ui"
import { DAY_MS } from "./helpers"

export default function CallBadges({ call, flags }) {
  const fresh = Date.now() - new Date(call.endedAt).getTime() <= DAY_MS
  return (
    <>
      {flags.support && (
        <Badge tone="rose">
          <AlertTriangle className="h-3 w-3" /> Support issue
        </Badge>
      )}
      {flags.urgent && !flags.support && (
        <Badge tone="amber">
          <Clock className="h-3 w-3" /> Urgent
        </Badge>
      )}
      {fresh && <Badge tone="emerald">New</Badge>}
      {call.callTotal > 1 && (
        <Badge tone="violet">
          Call {call.callIndex} of {call.callTotal}
        </Badge>
      )}
      {flags.hugeQty && <Badge tone="amber">Verify quantity</Badge>}
    </>
  )
}
