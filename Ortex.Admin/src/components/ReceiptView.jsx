import { Printer, X, CheckCircle2 } from "./icons"
import { formatCurrency, formatDate, amountInWords } from "../lib/format"
import { Button } from "./ui"

// Printable payment acknowledgement. Auto-titles itself:
//   • "Receipt Voucher"  — advance received before an invoice exists (GST Rule 50)
//   • "Payment Receipt"  — money received against an issued invoice
//
// `allocation` (optional) = { cumulative, balance } lets the receipt show how
// this payment sits against the invoice total.
export default function ReceiptView({ open, onClose, payment, invoice, settings, allocation }) {
  if (!open || !payment) return null
  const c = settings.company
  const isAdvance = !payment.invoiceId
  const heading = isAdvance ? "Receipt Voucher" : "Payment Receipt"
  const against = payment.invoiceNumber
    ? `Invoice ${payment.invoiceNumber}${invoice?.issueDate ? ` dated ${formatDate(invoice.issueDate)}` : ""}`
    : "Advance against order"
  const isPartial = allocation && allocation.balance > 0.5

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-0 sm:p-6">
      <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex max-w-2xl items-center justify-between gap-2 bg-card px-4 py-3 sm:rounded-xl">
        <span className="font-semibold text-foreground">
          {heading} · {payment.number}
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </div>

      <div className="print-area mx-auto max-w-2xl bg-white p-8 text-[13px] text-[#0b1220] sm:rounded-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#0b1220] pb-4">
          <div>
            <img src="/logo.svg" alt={c.name} className="mb-2 h-10 w-auto" />
            <div className="mt-2 text-xs leading-relaxed text-[#4b5563]">
              {c.address}
              <br />
              {c.phone} · {c.email}
              {c.gstin && (
                <>
                  <br />
                  GSTIN: {c.gstin}
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold uppercase tracking-wide">{heading}</div>
            <div className="mt-2 text-xs">
              <div>
                <span className="text-[#6b7280]">No: </span>
                <span className="font-semibold">{payment.number}</span>
              </div>
              <div>
                <span className="text-[#6b7280]">Date: </span>
                {formatDate(payment.date)}
              </div>
              <div>
                <span className="text-[#6b7280]">Mode: </span>
                {payment.method}
              </div>
            </div>
          </div>
        </div>

        {/* Received-with-thanks statement */}
        <div className="mt-6 rounded-lg border border-[#d1d5db] bg-[#f9fafb] p-5">
          <div className="flex items-center gap-2 text-[#15803d]">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Received with thanks</span>
          </div>
          <p className="mt-3 leading-relaxed text-[#0b1220]">
            Received from <span className="font-semibold">{payment.party || payment.customer?.name || "Not Specified"}</span>
            {payment.customer?.company ? ` (${payment.customer.company})` : ""} a sum of{" "}
            <span className="font-semibold">{formatCurrency(payment.amount)}</span>{" "}
            <span className="italic text-[#4b5563]">({amountInWords(payment.amount)})</span> vide{" "}
            <span className="font-semibold">{payment.method}</span>
            {payment.reference ? ` (Ref: ${payment.reference})` : ""} being{" "}
            {isPartial ? "part payment" : "payment"} towards <span className="font-semibold">{against}</span>.
          </p>
        </div>

        {/* Amount + allocation */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#d1d5db] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">Amount received</div>
            <div className="mt-1 text-2xl font-bold">{formatCurrency(payment.amount)}</div>
            <div className="text-xs text-[#4b5563]">{amountInWords(payment.amount)}</div>
          </div>
          <div className="rounded-lg border border-[#d1d5db] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">Against</div>
            <div className="mt-1 text-sm font-semibold">{against}</div>
            {allocation && (
              <div className="mt-2 space-y-0.5 text-xs text-[#4b5563]">
                {invoice && (
                  <div className="flex justify-between">
                    <span>Invoice total</span>
                    <span>{formatCurrency(invoice.totals?.grandTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Total received</span>
                  <span>{formatCurrency(allocation.cumulative)}</span>
                </div>
                <div className="flex justify-between font-semibold text-[#0b1220]">
                  <span>Balance outstanding</span>
                  <span>{formatCurrency(allocation.balance)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Advance / GST note */}
        {isAdvance && (
          <p className="mt-4 rounded-lg bg-[#f3f4f6] px-4 py-3 text-xs text-[#4b5563]">
            <span className="font-semibold text-[#0b1220]">Note:</span> This receipt voucher is issued under GST Rule 50 for an
            advance received before supply. For goods, GST is not payable on the advance (charged on the tax invoice at supply);
            any service component is taxed on receipt.
          </p>
        )}

        {/* Signature */}
        <div className="mt-8 flex items-end justify-between">
          <div className="text-xs text-[#6b7280]">
            {payment.note && (
              <>
                <span className="font-semibold text-[#0b1220]">Remarks: </span>
                {payment.note}
              </>
            )}
          </div>
          <div className="text-right">
            <div className="mb-8 text-sm font-semibold">For {c.name}</div>
            <div className="border-t border-[#6b7280] px-6 pt-1 text-xs text-[#6b7280]">Authorised signatory</div>
          </div>
        </div>
        <div className="mt-4 text-center text-[10px] text-[#9ca3af]">This is a computer-generated receipt.</div>
      </div>
    </div>
  )
}
