import { amountInWords, daysUntil, formatCurrency, formatDate } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import type { Customer, Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"

// The printable A4 quotation.
//
// PORT OF Ortex.Admin/src/components/documents/DocumentSheet.jsx (quotation
// half) — masthead → meta → parties → headline → line table → totals → notes,
// footer pinned to the sheet's bottom edge. The console renders that as React
// and rasterises it with html2canvas; both are browser-only, so here the same
// document is emitted as an HTML string and handed to expo-print, which uses
// the platform's own PDF renderer. Real text, selectable and searchable, rather
// than a screenshot of a web page.
//
// Geometry is in points to match the console's `.doc-*` CSS.

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** Preserve the line breaks a user typed into terms/notes/address. */
const nl2br = (v: unknown): string => esc(v).replace(/\r?\n/g, "<br />")

function partyBlock(party: Customer | null | undefined, placeholder = false): string {
  if (!party || (!party.name && !party.company)) return placeholder ? "<div>-</div>" : ""
  const rows = [
    esc(party.name || party.company),
    party.company && party.name ? esc(party.company) : "",
    party.address ? nl2br(party.address) : "",
    party.email ? esc(party.email) : "",
    party.phone ? esc(party.phone) : "",
    party.gstin ? `IN GST&nbsp;&nbsp;${esc(party.gstin)}` : "",
    party.stateCode ? `State: ${esc(stateLabel(party.stateCode))}` : "",
  ].filter(Boolean)
  return rows.map((r) => `<div>${r}</div>`).join("")
}

function totalRow(label: string, value: string, grand = false): string {
  return `<div class="total-row${grand ? " grand" : ""}"><span>${esc(label)}</span><span>${esc(
    value,
  )}</span></div>`
}

export function quotationHtml(doc: Quotation, settings: Settings): string {
  const c = settings.company
  const t = doc.totals || ({} as Quotation["totals"])
  const lines = doc.lines || []
  const psState = doc.shipTo?.stateCode || doc.customer?.stateCode
  const hsnCodes = [...new Set(lines.map((l) => l.hsn).filter(Boolean))]
  const number = doc.number || "Draft"

  // Tax component as a percentage of the taxable value, derived so the printed
  // rate always agrees with the money actually charged.
  const pct = (part?: number) =>
    t.taxable > 0 ? String(Math.round(((part || 0) / t.taxable) * 10000) / 100) : "0"

  const headline = (() => {
    const total = formatCurrency(t.grandTotal || 0)
    if (doc.status === "cancelled") return `${total} cancelled`
    const d = doc.validUntil ? daysUntil(doc.validUntil) : null
    if (d == null) return `${total} quoted on ${formatDate(doc.issueDate)}`
    return d < 0
      ? `${total} quoted, expired on ${formatDate(doc.validUntil)}`
      : `${total} quoted, valid until ${formatDate(doc.validUntil)}`
  })()

  const meta: [string, string][] = [
    ["Quotation number", number],
    ["Date of issue", formatDate(doc.issueDate)],
    ["Valid until", doc.validUntil ? formatDate(doc.validUntil) : "-"],
    ["Place of supply", psState ? stateLabel(psState) : "-"],
    ["GST registration", c.gstin || "-"],
  ]
  if (doc.paymentTerms) meta.push(["Payment terms", doc.paymentTerms])

  const lineRows = lines
    .map((line, i) => {
      const cl = (t.lines && t.lines[i]) || { taxable: line.quantity * line.rate }
      const detail = [
        line.hsn ? `HSN ${line.hsn}` : null,
        line.discountPercent ? `${line.discountPercent}% discount` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      return `<tr>
        <td>
          <div class="item-name">${esc(line.description || "Item")}</div>
          ${detail ? `<div class="item-detail">${esc(detail)}</div>` : ""}
        </td>
        <td class="num">${esc(line.quantity)}${line.unit ? ` ${esc(line.unit)}` : ""}</td>
        <td class="num">${esc(formatCurrency(line.rate))}</td>
        <td class="num">${esc(line.gstRate)}%</td>
        <td class="num">${esc(formatCurrency(cl.taxable))}</td>
      </tr>`
    })
    .join("")

  const totals = [
    totalRow("Subtotal", formatCurrency(t.subTotal)),
    t.totalDiscount > 0 ? totalRow("Discount", `-${formatCurrency(t.totalDiscount)}`) : "",
    t.interState
      ? t.igst > 0
        ? totalRow(`IGST (${pct(t.igst)}%)`, formatCurrency(t.igst))
        : ""
      : [
          t.cgst > 0 ? totalRow(`CGST (${pct(t.cgst)}%)`, formatCurrency(t.cgst)) : "",
          t.sgst > 0 ? totalRow(`SGST (${pct(t.sgst)}%)`, formatCurrency(t.sgst)) : "",
        ].join(""),
    t.roundOff ? totalRow("Round off", formatCurrency(t.roundOff)) : "",
    totalRow("Total", formatCurrency(t.grandTotal), true),
  ].join("")

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quotation ${esc(number)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    /* Zalando Sans is bundled in the app, not on the print renderer, so the
       document falls back to the platform's own UI face rather than shipping a
       base64 font into every PDF. */
    font-family: -apple-system, "Roboto", "Helvetica Neue", Arial, sans-serif;
    color: #071437;
    font-size: 9.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
  }
  .sheet {
    width: 210mm; min-height: 297mm;
    padding: 16mm 14mm 12mm;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: flex-end; justify-content: space-between; }
  .title { font-size: 22pt; font-weight: 800; letter-spacing: -0.4pt; }
  .brand { font-size: 16pt; font-weight: 800; color: #2567E8; letter-spacing: -0.3pt; }
  .keys { display: grid; grid-template-columns: auto 1fr; gap: 1.5pt 12pt; margin-top: 10mm; }
  .keys .k { color: #78829D; }
  .keys .v { text-align: right; }
  .keys .strong { font-weight: 700; }
  .parties { display: flex; gap: 8mm; margin-top: 8mm; }
  .party { flex: 1; color: #252F4A; }
  .party-label { color: #78829D; margin-bottom: 2pt; }
  .party-name { font-weight: 700; }
  .headline { margin-top: 8mm; font-size: 13pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 5mm; }
  th {
    text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4pt;
    color: #78829D; font-weight: 600; padding: 4pt 4pt; border-bottom: 0.75pt solid #252F4A;
  }
  th.num, td.num { text-align: right; }
  td { padding: 5pt 4pt; border-bottom: 0.5pt solid #EBEDF3; vertical-align: top; }
  .item-name { font-weight: 600; }
  .item-detail { color: #78829D; font-size: 8.5pt; }
  .after { display: flex; justify-content: flex-end; margin-top: 4mm; }
  .totals { width: 46%; }
  .total-row {
    display: flex; justify-content: space-between;
    padding: 3.5pt 0; border-top: 0.5pt solid #EBEDF3;
  }
  .total-row.grand { font-weight: 800; font-size: 11pt; border-top: 0.75pt solid #252F4A; }
  .notes { margin-top: 8mm; color: #4B5675; font-size: 8.5pt; }
  .notes h4 { margin: 4mm 0 1mm; font-size: 9pt; color: #071437; }
  .notes p { margin: 0 0 1.5mm; }
  /* Pinned to the bottom edge, the way the console flex-footer is. */
  .foot {
    margin-top: auto; padding-top: 6mm; display: flex; justify-content: space-between;
    color: #99A1B7; font-size: 8pt; border-top: 0.5pt solid #EBEDF3;
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="title">Quotation</div>
      <div class="brand">${esc(c.logoText || c.name)}</div>
    </div>

    <div class="keys">
      ${meta
        .map(
          ([k, v], i) =>
            `<span class="k${i === 0 ? " strong" : ""}">${esc(k)}</span><span class="v${
              i === 0 ? " strong" : ""
            }">${esc(v)}</span>`,
        )
        .join("")}
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-name">${esc(c.name)}</div>
        ${nl2br(c.address)}
        ${c.email ? `<div>${esc(c.email)}</div>` : ""}
        ${c.phone ? `<div>${esc(c.phone)}</div>` : ""}
        ${c.stateCode ? `<div>State: ${esc(stateLabel(c.stateCode))}</div>` : ""}
      </div>
      <div class="party">
        <div class="party-label">Quotation for</div>
        ${partyBlock(doc.customer, true)}
      </div>
      ${
        doc.shipTo
          ? `<div class="party"><div class="party-label">Ship to</div>${partyBlock(doc.shipTo)}</div>`
          : ""
      }
    </div>

    <div class="headline">${esc(headline)}</div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Tax</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    <div class="after"><div class="totals">${totals}</div></div>

    <div class="notes">
      ${hsnCodes.length ? `<p>HSN/SAC: ${esc(hsnCodes.join(", "))}</p>` : ""}
      <p>Quotation</p>
      <p>Amount in words: ${esc(amountInWords(t.grandTotal || 0))}</p>
      ${doc.terms ? `<h4>Terms and conditions</h4><p>${nl2br(doc.terms)}</p>` : ""}
      ${doc.notes ? `<h4>Notes</h4><p>${nl2br(doc.notes)}</p>` : ""}
    </div>

    <div class="foot">
      <span>This is a computer-generated quotation and does not require a signature.</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`
}
