import { Fragment, forwardRef } from "react"
import { taxRows } from "../../lib/pricing"
import { formatCurrency, formatDate, amountInWords, daysUntil } from "../../lib/format"
import { stateLabel } from "../../lib/gstStates"
import { dispatchBlock, registeredLines } from "../../lib/address"
import CompanyMark from "./CompanyMark"

// The A4 sheet for a quotation or tax invoice, the printable document
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
  const docs = settings.documents || {}
  const psState = doc.shipTo?.stateCode || doc.customer?.stateCode
  // The live status and paid amount when the caller derived them from the
  // payments (useInvoiceList's _status / _paid), else what is stored.
  const status = doc._status ?? doc.status
  const amountPaid = Number(doc._paid ?? doc.amountPaid) || 0
  const paid = isInvoice && status === "paid"
  const cancelled = status === "cancelled"
  const balance = isInvoice ? Math.max(0, (t.grandTotal || 0) - amountPaid) : t.grandTotal || 0
  const hsnCodes = [...new Set(lines.map((l) => l.hsn).filter(Boolean))]
  const number = doc.number || "Draft"
  // Tax component as a percentage of the taxable value, derived so the printed
  // rate always agrees with the money charged (Keystone: RatePercent, 0.## format).
  // The registered address (else the old single string). A dispatch address is
  // stacked under it in the same column, so the parties row keeps its two or
  // three columns. MIRRORED in Ortex.Mobile/src/documents/quotationHtml.ts.
  const supplierAddress = registeredLines(c)
  const structured = !!c.registeredAddress && supplierAddress.length > 0
  const dispatch = dispatchBlock(c)

  const headline = (() => {
    const total = formatCurrency(t.grandTotal || 0)
    if (cancelled) return `${total} cancelled`
    if (!isInvoice) {
      // NO DATE HERE. The meta block above already prints Date of issue and
      // Valid until as their own labelled rows, and repeating one beside the
      // amount made the sheet answer the same question twice. What this line
      // adds that those rows cannot is the STANDING, so that is all it keeps.
      const d = doc.validUntil ? daysUntil(doc.validUntil) : null
      return d != null && d < 0 ? `${total} quoted, now expired` : `${total} quoted`
    }
    // paidAt is written by migration 0066 when the last payment settles it;
    // without it the date is left out rather than guessed.
    if (paid) return doc.paidAt ? `${total} paid on ${formatDate(doc.paidAt)}` : `${total} paid`
    if (amountPaid > 0) return `${formatCurrency(balance)} due, ${formatCurrency(amountPaid)} received`
    return `${total} ${status === "overdue" ? "overdue" : "due"}${doc.dueDate ? ` by ${formatDate(doc.dueDate)}` : ""}`
  })()

  return (
    <div ref={ref} className={`doc-sheet print-area ${className}`}>
      {/* Masthead: document title left (bottom-aligned), brand mark right (24pt) */}
      <div className="doc-head">
        {/* GST Rule 46 asks for the words "Tax Invoice" on the invoice itself. */}
        <div className="doc-title">{isInvoice ? "Tax Invoice" : "Quotation"}</div>
        {/* The issuing company: its logo, and its full name under it. */}
        <div className="doc-brand">
          <CompanyMark companyId={doc.companyId} company={c} className="doc-logo" />
          {c.name && <div className="doc-brand-name">{c.name}</div>}
        </div>
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
        <span className="k">GSTIN</span>
        <span className="v">{c.gstin || "-"}</span>
        {/* Rule 46(p): whether tax is payable on reverse charge. Ortex's own supplies never are. */}
        {isInvoice && (
          <>
            <span className="k">Reverse charge</span>
            <span className="v">No</span>
          </>
        )}
        {/* WHO QUOTED IT, as a labelled row with the rest of the facts rather
            than a sentence in the footer: it is the same kind of thing as the
            place of supply, and a reader looking for "who do I ring" scans this
            block, not the small print under the totals. MIRRORED in the phone's
            Ortex.Mobile/src/documents/quotationHtml.ts. */}
        {!isInvoice && doc.showSeller && doc.sellerName && (
          <>
            <span className="k">Seller Name</span>
            <span className="v">{doc.sellerName}</span>
          </>
        )}
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
          {c.gstin && <div>GSTIN {c.gstin}</div>}
          {/* A structured address already ends with the state's name. */}
          {c.stateCode && !structured && <div>State: {stateLabel(c.stateCode)}</div>}
          {dispatch && (
            <div className="doc-party-sub">
              <div className="doc-party-label">{dispatch.title}</div>
              {dispatch.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
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
                <div className="doc-item-name">{isInvoice ? "Tax Invoice" : "Quotation"} (aggregate)</div>
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
            const detail = [line.hsn ? `HSN ${line.hsn}` : null, line.discountPercent ? `${line.discountPercent}% discount` : null].filter(Boolean).join(" · ")
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
          {taxRows(t).map((r) => (
            <Row key={r.label} label={r.label} value={formatCurrency(r.amount)} />
          ))}
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
        <p>Amount in words: {amountInWords(t.grandTotal || 0)}</p>
        {(doc.terms || c.bankName) && (
          <div className="doc-terms-row">
            <div className="doc-terms">
              {doc.terms && (
                <>
                  <h4>Terms and conditions</h4>
                  <p>{doc.terms}</p>
                </>
              )}
            </div>
            {/* On quotations too: a quote asking for an advance says how to pay it. */}
            {c.bankName && (
              <div className="doc-bank">
                <h4>To Pay</h4>
                <dl>
                  {[
                    ["Bank name", c.bankName],
                    ["Account number", c.bankAccount],
                    ["IFSC code", c.bankIfsc],
                    ["Branch", c.bankBranch],
                    ["UPI ID", c.upi],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <Fragment key={k}>
                        <dt>{k}:</dt>
                        <dd>{v}</dd>
                      </Fragment>
                    ))}
                </dl>
              </div>
            )}
          </div>
        )}
        {doc.notes && (
          <>
            <h4>Notes</h4>
            <p>{doc.notes}</p>
          </>
        )}
        {isInvoice && doc.tally?.voucherNumber && <p className="ref">Tally voucher: {doc.tally.voucherNumber}</p>}
        {/* Rule 46(q): the supplier's signature. */}
        {isInvoice && (
          <div className="doc-sign">
            <p>For {c.name}</p>
            <p className="doc-sign-line">Authorised signatory</p>
          </div>
        )}
      </div>

      <div className="doc-foot">
        <span>{(isInvoice ? docs.invoiceFooter : docs.quotationFooter) || ""}</span>
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
      {party.gstin && <div>GSTIN {party.gstin}</div>}
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
