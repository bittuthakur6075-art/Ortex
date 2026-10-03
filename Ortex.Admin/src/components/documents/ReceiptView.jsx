import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Printer, X, CheckCircle2, Download } from "../ui/Icons"
import { formatCurrency, formatDate, amountInWords } from "../../lib/format"
import { buildSheetPdf } from "./documentPdf"
import CompanyMark from "./CompanyMark"

// Printable payment acknowledgement. Titles itself:
//   • "Receipt Voucher": a payment recorded as an advance (`payment.advance`),
//     with a customer and no invoice yet (GST Rule 50)
//   • "Payment Receipt": everything else, with or without an invoice
//
// `allocation` (optional, receiptAllocation() in lib/invoiceMoney.js) =
// { cumulative, balance, partial } as of THIS payment, so a later payment
// does not change an earlier receipt. The payment's note is internal and is
// not printed.
export default function ReceiptView({ open, onClose, payment, invoice, settings, allocation }) {
  // Hooks must run unconditionally, so they come before the early return.
  const receiptRef = useRef(null)
  const [busy, setBusy] = useState(false)

  // The same overlay behaviour as DocumentView: <body> is marked so print
  // drops the app shell, and Escape closes.
  const shown = open && !!payment
  useEffect(() => {
    if (!shown) return
    document.body.classList.add("doc-open")
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("doc-open")
      window.removeEventListener("keydown", onKey)
    }
  }, [shown, onClose])

  if (!shown) return null
  const c = settings.company
  const isAdvance = !payment.invoiceId && !!payment.advance && !!(payment.customer || payment.party)
  const heading = isAdvance ? "Receipt Voucher" : "Payment Receipt"
  const against = payment.invoiceNumber
    ? `Invoice ${payment.invoiceNumber}${invoice?.issueDate ? ` dated ${formatDate(invoice.issueDate)}` : ""}`
    : isAdvance
      ? "Advance against order"
      : "On account"
  const isPartial = !!allocation?.partial


  // The same A4 path as quotations, invoices and payslips. It used its own
  // html2pdf call with 10 mm margins around a sheet already 297 mm tall, so
  // every receipt spilled onto a near-blank second page, and it captured the
  // sheet at the window width.
  const handleDownloadPDF = async () => {
    const element = receiptRef.current
    if (!element) return
    const stem = `receipt-${payment.number}`
    setBusy(true)
    try {
      const pdf = await buildSheetPdf(element, stem)
      pdf.save(`${stem}.pdf`)
      toast.success(`Downloaded ${stem}.pdf`)
    } catch (err) {
      console.error(err)
      toast.error("Could not generate the PDF.")
    } finally {
      setBusy(false)
    }
  }

  const party = payment.customer?.company || payment.party || payment.customer?.name

  return createPortal(
    <div className="doc-overlay" role="dialog" aria-modal="true" aria-label={`${heading} ${payment.number}`}>
      <div className="doc-toolbar no-print">
        <span className="doc-toolbar-title">
          {heading} {payment.number}
          {party && <small>{party}</small>}
        </span>
        <button type="button" className="doc-tb-btn ghost" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </button>
        <button type="button" className="doc-tb-btn primary" onClick={handleDownloadPDF} disabled={busy}>
          <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download PDF"}
        </button>
        <button type="button" className="doc-tb-close" onClick={onClose} aria-label="Close">
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="doc-scroll">
      <div ref={receiptRef} className="print-area mx-auto w-full max-w-[210mm] bg-white p-8 sm:p-12 text-[13px] text-[#0b1220] sm:rounded-xl flex flex-col" style={{ minHeight: "297mm" }}>
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#0b1220] pb-4">
          <div>
            <CompanyMark companyId={payment?.companyId} company={c} className="mb-2 h-10 w-auto" />
            {c.name && <div className="text-sm font-semibold">{c.name}</div>}
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
            Received from <span className="font-semibold">{payment.party || payment.customer?.name || "Not specified"}</span>
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
          <div />
          <div className="text-right">
            <div className="mb-8 text-sm font-semibold">For {c.name}</div>
            <div className="border-t border-[#6b7280] px-6 pt-1 text-xs text-[#6b7280]">Authorised signatory</div>
          </div>
        </div>
        <div className="mt-auto pt-6 text-center text-[10px] text-[#9ca3af]">{settings.documents?.receiptFooter}</div>
      </div>
      </div>
    </div>,
    document.body,
  )
}
