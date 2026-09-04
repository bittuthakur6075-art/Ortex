import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
} from "../../components/ui/Icons"
import { Button, Drawer, Select } from "../../components/ui/Ui"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { formatDateTime } from "../../lib/format"
import CallTimeline from "./CallTimeline"
import ContactRow from "./ContactRow"
import Detail from "./Detail"
import ItemsList from "./ItemsList"

export default function CallDrawer({ active, saving, onClose, onStatus, onQuotation }) {
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
          {active.flags.support && (
            <div className="flex gap-2.5 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <p>
                This call mentions a complaint or cancellation. Handle it as support before any sales follow-up, a
                quotation here will read as tone deaf.
              </p>
            </div>
          )}

          {!active.named && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              Anu never captured a name on this call. Open with the number and the requirement instead.
            </div>
          )}

          <ContactRow call={active} />

          <div className="space-y-3 rounded-lg bg-muted/40 p-4">
            <ItemsList items={active.itemsList} />
            <div className="space-y-2 border-t border-border/60 pt-3">
              <Detail icon={CalendarClock} label="Timeline" value={active.timeline} />
              <Detail icon={Building2} label="Company" value={active.customer.company} />
              <Detail icon={Mail} label="Email" value={active.customer.email} />
              <Detail icon={MapPin} label="Deliver to" value={active.customer.address} />
              {!active.customer.address && (
                <div className="flex gap-2.5 text-sm text-amber-600">
                  <MapPin className="mt-0.5 h-4 w-4 flex-none" />
                  <span>Delivery city not captured. Ask for it before quoting freight.</span>
                </div>
              )}
            </div>
          </div>

          {active.flags.incomplete && active.itemsList.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              One or more items have no quantity. Confirm them before quoting, a line without a quantity cannot be
              priced.
            </div>
          )}

          {active.flags.hugeQty && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              The quantity on this call is unusually large. Confirm it before it is used for pricing, spoken figures
              like this are often a slip of the tongue.
            </div>
          )}

          <CallTimeline call={active} />

          {active.callTotal > 1 && (
            <div className="flex gap-2.5 rounded-lg bg-violet-500/10 p-3 text-sm text-violet-700 dark:text-violet-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
              <p>
                This customer has called {active.callTotal} times. Repeat callers convert far better than first-time
                ones, so treat this as a warm lead.
              </p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
