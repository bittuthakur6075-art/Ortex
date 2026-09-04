import { formatDate } from "../../lib/format"
import { Badge } from "../../components/ui/Ui"

// Ortex.Tally.Connector stamps doc.tally = { status, syncedAt, voucherRef, error }
// on every record it pushes to TallyPrime. Nothing in the console read it, so a
// voucher Tally rejected was invisible here — the only trace was a line in the
// connector's terminal on whichever PC it runs on. Records with no `tally` at
// all are ones the connector has not picked up yet (it treats a missing status
// as "pending"), which is also the state of everything if it never runs.
export default function TallyBadge({ tally }) {
  if (tally?.status === "synced") {
    const when = tally.syncedAt ? ` · ${formatDate(tally.syncedAt)}` : ""
    return (
      <span title={tally.voucherRef ? `Tally voucher ${tally.voucherRef}${when}` : `Synced with Tally${when}`}>
        <Badge tone="emerald">Synced</Badge>
      </span>
    )
  }
  if (tally?.status === "error") {
    return (
      <span title={tally.error || "Tally rejected this voucher"}>
        <Badge tone="rose">Error</Badge>
      </span>
    )
  }
  return (
    <span title="Not yet pushed to Tally by the connector">
      <Badge tone="slate">Not synced</Badge>
    </span>
  )
}
