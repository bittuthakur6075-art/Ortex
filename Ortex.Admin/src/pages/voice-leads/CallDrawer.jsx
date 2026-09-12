import { useMemo } from "react"
import { Building2, CalendarClock, CheckCircle2, FileText, Mail, MapPin } from "../../components/ui/Icons"
import { Button, Drawer, Select } from "../../components/ui/Ui"
import { Advisories } from "../../components/ui/Advisories"
import { voiceCallAdvisories } from "../../lib/advisories"
import { RecordActivity } from "../../components/ui/RecordActivity"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { formatDateTime } from "../../lib/format"
import CallRecordings from "./CallRecordings"
import CallTimeline from "./CallTimeline"
import ContactRow from "./ContactRow"
import Detail from "./Detail"
import ItemsList from "./ItemsList"

export default function CallDrawer({ active, related = [], saving, onClose, onStatus, onQuotation }) {
  const advisories = useMemo(() => voiceCallAdvisories(active, { related }), [active, related])
  // The website stamps every capture with `call` (Ortex.Web live-orty); the
  // newest row says whether the customer confirmed Anu's read-back. Rows saved
  // before that existed carry nothing, and the line stays hidden for them.
  const latest = active?.rows?.[0]?.call
  const confirmation = latest ? (latest.confirmed ? "Customer confirmed all details on the call" : "Not confirmed on the call") : ""

  return (
    <Drawer
      open={Boolean(active)}
      onClose={onClose}
      title={active?.name || "Call"}
      subtitle={active ? `${formatDateTime(active.endedAt)} · Call ${active.callIndex} of ${active.callTotal}` : ""}
      width="max-w-xl"
      footer={
        active && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Select
              className="w-auto flex-1"
              value={active.status}
              disabled={saving}
              onChange={(e) => onStatus(active, e.target.value)}
            >
              {ENQUIRY_STATUS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
            <Button onClick={() => onQuotation(active)}>
              <FileText className="h-4 w-4" /> Create quotation
            </Button>
          </div>
        )
      }
    >
      {active && (
        <div className="space-y-5">
          {/* Everything worth knowing before the callback, in the order it would
              change what the caller says — support first, always. Replaces four
              notices that used to be written inline here and duplicated the
              field-sales app's wording without sharing it; the sentences now
              come from lib/advisories.js, so both clients say the same thing. */}
          <Advisories items={advisories} />

          <ContactRow call={active} />

          <div className="space-y-3 rounded-lg bg-muted/40 p-4">
            <ItemsList items={active.itemsList} />
            <div className="space-y-2 border-t border-border/60 pt-3">
              <Detail icon={CalendarClock} label="Timeline" value={active.timeline} />
              <Detail icon={Building2} label="Company" value={active.customer.company} />
              <Detail icon={Mail} label="Email" value={active.customer.email} />
              <Detail icon={MapPin} label="Deliver to" value={active.customer.address} />
              <Detail icon={CheckCircle2} label="Read-back" value={confirmation} />
            </div>
          </div>

          <CallRecordings call={active} />

          <CallTimeline call={active} />

          {/* A folded call is several `enquiries` rows sharing a phone number;
              `active.id` is the newest capture. A status change writes to every
              folded row, so this row's history is representative of the call —
              but an edit made to an older capture shows on that row, not here. */}
          <div className="border-t border-border pt-4">
            <RecordActivity collection="enquiries" record={active} bare title="Activity" />
          </div>
        </div>
      )}
    </Drawer>
  )
}
