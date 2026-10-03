import { useRef, useState } from "react"
import { Button, Modal } from "../../components/ui/Ui"
import { rupees } from "../../lib/salesWork"
import { convertToInvoice } from "./actions"

/**
 * "Convert to invoice?" with the quotation's number and total, before an
 * invoice number is minted. `ask(q, then)` opens it; `then(invoice)` runs after
 * a successful conversion. Render `element` once.
 */
export function useConvertConfirm() {
  const [q, setQ] = useState(null)
  const [busy, setBusy] = useState(false)
  const then = useRef(null)

  const ask = (quote, after) => {
    then.current = after
    setQ(quote)
  }
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const inv = await convertToInvoice(q)
      setQ(null)
      if (inv) then.current?.(inv)
    } finally {
      setBusy(false)
    }
  }

  const c = q?.customer || {}
  const element = (
    <Modal
      open={!!q}
      onClose={busy ? () => {} : () => setQ(null)}
      title="Convert to invoice?"
      width="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={() => setQ(null)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy}>{busy ? "Converting…" : "Create invoice"}</Button>
        </>
      }
    >
      {q && (
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            <span className="font-semibold">{q.number || "This quotation"}</span>
            {c.company || c.name ? ` · ${c.company || c.name}` : ""}
          </p>
          <p className="text-muted-foreground">
            A new invoice for <span className="font-semibold text-foreground">{rupees(q.totals?.grandTotal)}</span> incl. GST is made with the same lines and prices, under the next invoice number, and the quotation is marked invoiced.
          </p>
        </div>
      )}
    </Modal>
  )

  return { ask, element }
}
