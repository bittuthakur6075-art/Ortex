import { ReceiptText } from "../../components/ui/Icons"
import { formatDate, formatCurrency } from "../../lib/format"

// Inflow payments linked to the invoice being edited, with a print-receipt action.
export default function PaymentHistory({ payments, onReceipt }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Payments received</h3>
      <div className="divide-y divide-border rounded-xl border border-border">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
              <span className="text-muted-foreground"> · {p.method}</span>
              {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
              <button onClick={() => onReceipt(p)} className="text-muted-foreground hover:text-primary" title="Print receipt">
                <ReceiptText className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
