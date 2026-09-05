import { forwardRef } from "react"
import { formatCurrency, formatDate, amountInWords, daysUntil } from "../../lib/format"
import { stateLabel } from "../../lib/gstStates"

// The A4 sheet for a quotation or tax invoice — the printable document
// itself, without any overlay chrome. A one-to-one port of Keystone's
// InvoicePdfDocument (QuestPDF): masthead → meta → parties → headline → line
// table → totals → notes, with the footer pinned to the sheet's bottom edge.
// Geometry lives in index.css (`.doc-*`, in points). Rendered full-size by
// DocumentView (print / PDF) and scaled by LivePreview in the editors.
// `type` is "quotation" | "invoice".
const DocumentSheet = forwardRef(function DocumentSheet({ doc, settings, type, className = "" }, ref) {
  const c = settings.company
  // Tally-imported invoices persist only aggregate totals (no per-line `lines`
  // array), so default defensively.
  const t = doc.totals || {}
  const lines = doc.lines || []
  const isInvoice = type === "invoice"
  const kind = isInvoice ? "tax invoice" : "quotation"
  const psState = doc.shipTo?.stateCode || doc.customer?.stateCode
  const paid = isInvoice && doc.status === "paid"
  const cancelled = doc.status === "cancelled"
  const balance = isInvoice ? Math.max(0, (t.grandTotal || 0) - (doc.amountPaid || 0)) : t.grandTotal || 0
  const hsnCodes = [...new Set(lines.map((l) => l.hsn).filter(Boolean))]
  const number = doc.number || "Draft"
  // Tax component as a percentage of the taxable value, derived so the printed
  // rate always agrees with the money charged (Keystone: RatePercent, 0.## format).
  const pct = (part) => (t.taxable > 0 ? String(Math.round(((part || 0) / t.taxable) * 10000) / 100) : "0")
  const supplierAddress = (c.address || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const headline = (() => {
    const total = formatCurrency(t.grandTotal || 0)
    if (cancelled) return `${total} cancelled`
    if (!isInvoice) {
      const d = doc.validUntil ? daysUntil(doc.validUntil) : null
      if (d == null) return `${total} quoted on ${formatDate(doc.issueDate)}`
      return d < 0 ? `${total} quoted, expired on ${formatDate(doc.validUntil)}` : `${total} quoted, valid until ${formatDate(doc.validUntil)}`
    }
    if (paid) return `${total} paid on ${formatDate(doc.paidAt || doc.issueDate)}`
    if (doc.amountPaid > 0) return `${formatCurrency(balance)} due, ${formatCurrency(doc.amountPaid)} received`
    return `${total} ${doc.status === "overdue" ? "overdue" : "due"}${doc.dueDate ? ` by ${formatDate(doc.dueDate)}` : ""}`
  })()

  return (
    <div ref={ref} className={`doc-sheet print-area ${className}`}>
      {/* Masthead: document title left (bottom-aligned), brand mark right (24pt) */}
      <div className="doc-head">
        <div className="doc-title">{isInvoice ? "Invoice" : "Quotation"}</div>
        <img src="/logo.svg" alt={c.name} className="doc-logo" />
      </div>

      {/* Meta: label / value stack. Lead row semibold, the rest medium. */}
      <div className="doc-keys">
        <span className="k strong">{isInvoice ? "Invoice number" : "Quotation number"}</span>
        <span className="v strong">{number}</span>
        <span className="k">Date of issue</span>
        <span className="v">{formatDate(doc.issueDate)}</span>
        {isInvoice ? (
          <>
            <span className="k">Due date</span>
            <span className="v">{doc.dueDate ? formatDate(doc.dueDate) : "-"}</span>
          </>
        ) : (
          <>
            <span className="k">Valid until</span>
            <span className="v">{doc.validUntil ? formatDate(doc.validUntil) : "-"}</span>
          </>
        )}
        {doc.quotationNumber && (
          <>
            <span className="k">Against quotation</span>
            <span className="v">{doc.quotationNumber}</span>
          </>
        )}
        <span className="k">Place of supply</span>
        <span className="v">{psState ? stateLabel(psState) : "-"}</span>
        <span className="k">GST registration</span>
        <span className="v">{c.gstin || "-"}</span>
        {doc.paymentTerms && (
          <>
            <span className="k">Payment terms</span>
            <span className="v">{doc.paymentTerms}</span>
          </>
        )}
      </div>

      {/* Parties: supplier left, buyer right. Both required on a tax invoice. */}
      <div className={`doc-parties${doc.shipTo ? " three" : ""}`}>
        <div className="doc-party">
          <div className="doc-party-name">{c.name}</div>
          {supplierAddress.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {c.email && <div>{c.email}</div>}
          {c.phone && <div>{c.phone}</div>}
          {c.stateCode && <div>State: {stateLabel(c.stateCode)}</div>}
        </div>
        <div className="doc-party">
          <div className="doc-party-label">{isInvoice ? "Bill to" : "Quotation for"}</div>
          <Party party={doc.customer} placeholder />
        </div>
        {doc.shipTo && (
          <div className="doc-party">
            <div className="doc-party-label">Ship to</div>
            <Party party={doc.shipTo} />
          </div>
        )}
      </div>

      {/* Headline: the amount, stated once at reading size. */}
      <div className="doc-headline">{headline}</div>

      {/* Line table: Description / Qty / Unit price / Tax / Amount */}
      <table className="doc-table">
        <colgroup>
          <col />
          <col className="c-qty" />
          <col className="c-unit" />
          <col className="c-tax" />
          <col className="c-amt" />
        </colgroup>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Tax</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td>
                <div className="doc-item-name">{isInvoice ? "Tax invoice" : "Quotation"} (aggregate)</div>
                <div className="doc-item-detail">Imported document without itemised lines</div>
              </td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>{formatCurrency(t.taxable || 0)}</td>
            </tr>
          )}
          {lines.map((line, i) => {
            const cl = (t.lines && t.lines[i]) || {}
            const detail = [line.hsn ? `HSN ${line.hsn}` : null, line.discountPercent ? `${line.discountPercent}% discount` : null, line.dueOn ? `Due ${formatDate(line.dueOn)}` : null].filter(Boolean).join(" · ")
            return (
              <tr key={i}>
                <td>
                  <div className="doc-item-name">{line.description || "Item"}</div>
                  {detail && <div className="doc-item-detail">{detail}</div>}
                </td>
                <td>
                  {line.quantity}
                  {line.unit ? ` ${line.unit}` : ""}
                </td>
                <td>{formatCurrency(line.rate)}</td>
                <td>{line.gstRate}%</td>
                <td>{formatCurrency(cl.taxable ?? line.quantity * line.rate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals: right half, hairline above each row, settled figure bold. */}
      <div className="doc-after">
        <div className="doc-totals">
          <Row label="Subtotal" value={formatCurrency(t.subTotal)} />
          {t.totalDiscount > 0 && <Row label="Discount" value={`-${formatCurrency(t.totalDiscount)}`} />}
          {t.interState ? (
            t.igst > 0 && <Row label={`IGST (${pct(t.igst)}%)`} value={formatCurrency(t.igst)} />
          ) : (
            <>
              {t.cgst > 0 && <Row label={`CGST (${pct(t.cgst)}%)`} value={formatCurrency(t.cgst)} />}
              {t.sgst > 0 && <Row label={`SGST (${pct(t.sgst)}%)`} value={formatCurrency(t.sgst)} />}
            </>
          )}
          {t.roundOff ? <Row label="Round off" value={formatCurrency(t.roundOff)} /> : null}
          {isInvoice ? (
            <>
              <Row label="Total" value={formatCurrency(t.grandTotal)} />
              <Row label={paid ? "Amount paid" : "Amount due"} value={formatCurrency(paid ? t.grandTotal : balance)} grand />
            </>
          ) : (
            <Row label="Total" value={formatCurrency(t.grandTotal)} grand />
          )}
        </div>
      </div>

      {/* Notes: HSN/SAC, the document's own declaration, then its text. */}
      <div className="doc-notes">
        {hsnCodes.length > 0 && <p>HSN/SAC: {hsnCodes.join(", ")}</p>}
        <p>{isInvoice ? "Tax invoice" : "Quotation"}</p>
        <p>Amount in words: {amountInWords(t.grandTotal || 0)}</p>
        {isInvoice && c.bankName && (
          <p>
            Bank: {c.bankName}
            {c.bankAccount && <>, A/C {c.bankAccount}</>}
            {c.bankIfsc && <>, IFSC {c.bankIfsc}</>}
            {c.upi && <>, UPI {c.upi}</>}
          </p>
        )}
        {doc.terms && (
          <>
            <h4>Terms and conditions</h4>
            <p>{doc.terms}</p>
          </>
        )}
        {doc.notes && (
          <>
            <h4>Notes</h4>
            <p>{doc.notes}</p>
          </>
        )}
        {isInvoice && doc.tally?.voucherNumber && <p className="ref">Tally voucher: {doc.tally.voucherNumber}</p>}
      </div>

      <div className="doc-foot">
        <span>This is a computer-generated {kind} and does not require a signature.</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  )
})

export default DocumentSheet

function Party({ party, placeholder }) {
  if (!party || (!party.name && !party.company)) {
    return placeholder ? <div>-</div> : null
  }
  return (
    <>
      <div>{party.name || party.company}</div>
      {party.company && party.name && <div>{party.company}</div>}
      {party.address && <div>{party.address}</div>}
      {party.email && <div>{party.email}</div>}
      {party.phone && <div>{party.phone}</div>}
      {party.gstin && <div>IN GST&nbsp;&nbsp;{party.gstin}</div>}
      {party.stateCode && <div>State: {stateLabel(party.stateCode)}</div>}
    </>
  )
}

function Row({ label, value, grand }) {
  return (
    <div className={`doc-total-row${grand ? " grand" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
