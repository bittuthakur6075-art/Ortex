import { Button, Modal } from "../../components/ui/Ui"
import { prettyPhone } from "./helpers"

/**
 * Confirm before deleting a folded Anu call.
 *
 * It names the caller, the number and HOW MANY ROWS go, because a call is not
 * one record: Anu calls `capture_lead` every time the picture firms up and each
 * one is its own `enquiries` insert, so a three-minute conversation is three
 * rows folded by phone (see helpers.js). Deleting only the newest would leave
 * the earlier captures to resurface as their own call, which is exactly the
 * confusion the fold exists to prevent.
 *
 * The recording is deliberately NOT deleted. Migration 0025 gives the
 * voice-recordings bucket no update or delete policy at all, on the grounds
 * that a recording is evidence of what was said; the dialog says so rather than
 * letting a person assume the audio went with the lead.
 */
export default function DeleteCallDialog({ call, busy, onCancel, onConfirm }) {
  const rows = call?.rows?.length || 0
  const recordings = new Set((call?.rows || []).map((r) => r.call?.recording).filter(Boolean))

  return (
    <Modal
      open={Boolean(call)}
      onClose={busy ? () => {} : onCancel}
      title="Delete this call?"
      width="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : `Delete ${rows} row${rows === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {call && (
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            <span className="font-semibold">{call.named ? call.customer.name : "Unnamed caller"}</span>
            {call.customer.phone ? ` · ${prettyPhone(call.customer.phone)}` : ""}
          </p>

          <p className="text-muted-foreground">
            This call is <span className="font-semibold text-foreground">{rows}</span> enquiry{" "}
            {rows === 1 ? "row" : "rows"} folded together. All of {rows === 1 ? "it" : "them"} will be
            deleted, so the call cannot come back as older captures.
          </p>

          {recordings.size > 0 && (
            <p className="text-muted-foreground">
              The call {recordings.size === 1 ? "recording stays" : "recordings stay"} in storage.
              Recordings are kept as a record of what was said and cannot be deleted from here.
            </p>
          )}

          <p className="text-destructive-text">This cannot be undone.</p>
        </div>
      )}
    </Modal>
  )
}
