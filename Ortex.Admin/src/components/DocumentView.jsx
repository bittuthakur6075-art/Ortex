import { Printer, X } from "./icons"
import { formatCurrency, formatDate, amountInWords } from "../lib/format"
import { Button } from "./ui"

// Full-screen, printable A4-style document for a quotation or invoice.
// `type` is "quotation" | "invoice". Uses the .print-area / .no-print hooks in
// index.css so window.print() emits just the document on white paper.
export default function DocumentView({ open, onClose, doc, settings, type }) {
  if (!open || !doc) return null
  const c = settings.company
  const t = doc.totals
  const isInvoice = type === "invoice"
  const heading = isInvoice ? "TAX INVOICE" : "QUOTATION"
  // GST place of supply follows the ship-to (consignee) state when present.
  const psState = doc.shipTo?.stateCode || doc.customer?.stateCode

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-0 sm:p-6">
      {/* Toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2 rounded-none bg-card px-4 py-3 sm:rounded-xl">
        <span className="font-semibold text-foreground">
          {heading} · {doc.number}
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

      {/* Document */}
      <div className="print-area mx-auto max-w-3xl bg-white p-8 text-[13px] text-[#0b1220] sm:rounded-xl" style={{ minHeight: "60vh" }}>
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#0b1220] pb-4">
          <div>
            <img src="/logo.svg" alt={c.name} className="mb-2 h-10 w-auto" />
            <div className="mt-2 text-xs leading-relaxed text-[#4b5563]">
              {c.address}
              <br />
              {c.phone} · {c.email}
              <br />
              {c.website}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold uppercase tracking-wide">{heading}</div>
            <div className="mt-2 text-xs">
              <div>
                <span className="text-[#6b7280]">No: </span>
                <span className="font-semibold">{doc.number}</span>
              </div>
              <div>
                <span className="text-[#6b7280]">Date: </span>
                {formatDate(doc.issueDate)}
              </div>
              {isInvoice ? (
                <div>
                  <span className="text-[#6b7280]">Due: </span>
                  {formatDate(doc.dueDate)}
                </div>
              ) : (
                <div>
                  <span className="text-[#6b7280]">Valid until: </span>
                  {formatDate(doc.validUntil)}
                </div>
              )}
              {c.gstin && (
                <div>
                  <span className="text-[#6b7280]">GSTIN: </span>
                  {c.gstin}
                </div>
              )}
              {doc.paymentTerms && (
                <div>
                  <span className="text-[#6b7280]">Payment: </span>
                  {doc.paymentTerms}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bill to + Ship to */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">{isInvoice ? "Buyer (Bill to)" : "Quotation for"}</div>
            <Party party={doc.customer} />
          </div>
          {doc.shipTo ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">Consignee (Ship to)</div>
              <Party party={doc.shipTo} />
            </div>
          ) : (
            <div className="text-right text-xs text-[#4b5563]">
              <div>Place of supply: State {psState || "Not Specified"}</div>
              <div>Tax type: {t.interState ? "IGST (inter-state)" : "CGST + SGST (intra-state)"}</div>
            </div>
          )}
        </div>
        {doc.shipTo && (
          <div className="mt-1 text-xs text-[#4b5563]">
            Place of supply: State {psState || "Not Specified"} · Tax: {t.interState ? "IGST (inter-state)" : "CGST + SGST (intra-state)"}
          </div>
        )}

        {/* Lines */}
        <table className="mt-4 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#f3f4f6] text-left">
              <th className="border border-[#d1d5db] px-2 py-1.5">#</th>
              <th className="border border-[#d1d5db] px-2 py-1.5">Description</th>
              <th className="border border-[#d1d5db] px-2 py-1.5">HSN</th>
              <th className="border border-[#d1d5db] px-2 py-1.5">Due on</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">Qty</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">Rate</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">Disc</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">Taxable</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">GST</th>
              <th className="border border-[#d1d5db] px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, i) => {
              const cl = t.lines[i]
              return (
                <tr key={i}>
                  <td className="border border-[#d1d5db] px-2 py-1.5">{i + 1}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5">{line.description}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5">{line.hsn}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5">{line.dueOn ? formatDate(line.dueOn) : "N/A"}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">
                    {line.quantity} {line.unit || ""}
                  </td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{formatCurrency(line.rate)}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{line.discountPercent}%</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{formatCurrency(cl.taxable)}</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{line.gstRate}%</td>
                  <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{formatCurrency(cl.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals + words */}
        <div className="mt-4 flex justify-between gap-6">
          <div className="flex-1 text-xs">
            <div className="font-semibold">Amount in words</div>
            <div className="text-[#4b5563]">{amountInWords(t.grandTotal)}</div>
            {isInvoice && c.bankName && (
              <div className="mt-4">
                <div className="font-semibold">Bank details</div>
                <div className="text-[#4b5563]">
                  {c.bankName} · A/C {c.bankAccount} · IFSC {c.bankIfsc}
                  {c.upi && <> · UPI {c.upi}</>}
                </div>
              </div>
            )}
          </div>
          <div className="w-64 text-xs">
            <Line label="Sub-total" value={formatCurrency(t.subTotal)} />
            {t.totalDiscount > 0 && <Line label="Discount" value={`−${formatCurrency(t.totalDiscount)}`} />}
            <Line label="Taxable value" value={formatCurrency(t.taxable)} />
            {t.interState ? (
              <Line label="IGST" value={formatCurrency(t.igst)} />
            ) : (
              <>
                <Line label="CGST" value={formatCurrency(t.cgst)} />
                <Line label="SGST" value={formatCurrency(t.sgst)} />
              </>
            )}
            {t.roundOff !== 0 && <Line label="Round off" value={formatCurrency(t.roundOff)} />}
            <div className="mt-1 flex justify-between border-t-2 border-[#0b1220] pt-1.5 text-sm font-bold">
              <span>Grand total</span>
              <span>{formatCurrency(t.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Terms + signature */}
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-[#d1d5db] pt-4 text-xs">
          <div>
            {doc.terms && (
              <>
                <div className="font-semibold">Terms & conditions</div>
                <div className="whitespace-pre-wrap text-[#4b5563]">{doc.terms}</div>
              </>
            )}
            {doc.notes && <div className="mt-2 text-[#4b5563]">Note: {doc.notes}</div>}
          </div>
          <div className="flex flex-col items-end justify-end text-right">
            <div className="mb-8 font-semibold">For {c.name}</div>
            <div className="border-t border-[#6b7280] px-8 pt-1 text-[#6b7280]">Authorised signatory</div>
          </div>
        </div>
        <div className="mt-4 text-center text-[10px] text-[#9ca3af]">
          This is a computer-generated document.
        </div>
      </div>
    </div>
  )
}

function Party({ party }) {
  if (!party) return null
  return (
    <>
      <div className="mt-1 font-semibold">{party.company || party.name}</div>
      {party.company && party.name && <div>{party.name}</div>}
      <div className="text-xs text-[#4b5563]">
        {party.address}
        {party.address && <br />}
        {party.phone} {party.email ? `· ${party.email}` : ""}
        {party.gstin && (
          <>
            <br />
            GSTIN: {party.gstin}
          </>
        )}
      </div>
    </>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-[#6b7280]">{label}</span>
      <span>{value}</span>
    </div>
  )
}
