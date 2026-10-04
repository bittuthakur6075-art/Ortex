import { amountInWords, daysUntil, formatCurrency, formatDate } from "@/domain/format"
import { taxRows } from "@/domain/pricing"
import { dispatchBlock, registeredLines } from "@/domain/address"
import { stateLabel } from "@/domain/gstStates"
import type { Customer, Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import { DOCUMENT_FONT_WOFF2_BASE64 } from "@/documents/documentFont"
import { companyMarkSvg, isMedinetix, isAman } from "@/domain/companyMark"
import { ORTEX_WORDMARK_DATA_URI, MEDINETIX_WORDMARK_DATA_URI, AMAN_WORDMARK_DATA_URI } from "@/theme/logo"

// The printable A4 quotation.
//
// A FAITHFUL PORT of Ortex.Admin's document — the markup of
// `src/components/documents/DocumentSheet.jsx` and the geometry of the `.doc-*`
// rules in `src/index.css`, which are themselves a reproduction of Keystone's
// InvoicePdfDocument (QuestPDF). Every measurement below is the console's, in
// points, so a quotation printed from a phone and the same quotation printed
// from the console are the same document. If the console's geometry changes,
// change it here too.
//
// The console rasterises its DOM with html2canvas; both that and html2pdf are
// browser-only, so here the same layout is emitted as an HTML string and given
// to expo-print, which uses the platform's own PDF engine. The output is real
// selectable text rather than a screenshot of a web page.
//
// The typeface and the logo are both embedded (documentFont.ts, theme/logo.ts):
// a remote font or image is frequently still unloaded when the renderer
// snapshots the page, and a salesperson in the field may have no signal at all.
//

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

function party(p: Customer | null | undefined, placeholder = false): string {
  if (!p || (!p.name && !p.company)) return placeholder ? "<div>-</div>" : ""
  return [
    `<div>${esc(p.name || p.company)}</div>`,
    p.company && p.name ? `<div>${esc(p.company)}</div>` : "",
    p.address ? `<div>${esc(p.address)}</div>` : "",
    p.email ? `<div>${esc(p.email)}</div>` : "",
    p.phone ? `<div>${esc(p.phone)}</div>` : "",
    p.gstin ? `<div>GSTIN ${esc(p.gstin)}</div>` : "",
    p.stateCode ? `<div>State: ${esc(stateLabel(p.stateCode))}</div>` : "",
  ]
    .filter(Boolean)
    .join("")
}

const totalRow = (label: string, value: string, grand = false) =>
  `<div class="doc-total-row${grand ? " grand" : ""}"><span>${esc(label)}</span><span>${esc(
    value,
  )}</span></div>`

/**
 * The "To Pay" box beside the terms, the console's DocumentSheet box, so a
 * customer paying the advance on a quote need not ask how. Only the parts that
 * are filled in.
 */
function bankBox(c: Settings["company"]): string {
  const rows = [
    ["Bank name", c.bankName],
    ["Account number", c.bankAccount],
    ["IFSC code", c.bankIfsc],
    ["Branch", c.bankBranch],
    ["UPI ID", c.upi],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${esc(k)}:</dt><dd>${esc(v)}</dd>`)
    .join("")
  return `<div class="doc-bank"><h4>To Pay</h4><dl>${rows}</dl></div>`
}

/**
 * The masthead mark of the company that issued it (Admin migration 0075): its
 * uploaded logo, else Ortex's own wordmark for Ortex (and for a record from
 * before companies), else a monogram in the company's colour
 * (domain/companyMark.ts, the console's twin).
 *
 * `logo`: a data URI of the uploaded logo, embedded by lib/pdf.ts so expo-print
 * never renders before a remote image arrives; null when it could not be
 * fetched; undefined to use the URL as it is (the on-screen preview).
 */
export function mastheadLogo(doc: Quotation, c: Settings["company"], logo?: string | null): string {
  const src = logo === undefined ? c?.logoUrl : logo
  if (src) return src
  if (isMedinetix(doc.companyId, c?.name)) return MEDINETIX_WORDMARK_DATA_URI
  if (isAman(doc.companyId, c?.name)) return AMAN_WORDMARK_DATA_URI
  if (!doc.companyId || doc.companyId === "ortex") return ORTEX_WORDMARK_DATA_URI
  return `data:image/svg+xml;utf8,${encodeURIComponent(companyMarkSvg(doc.companyId, c?.name))}`
}

export function quotationHtml(doc: Quotation, settings: Settings, logo?: string | null): string {
  const c = settings.company
  const t = doc.totals || ({} as Quotation["totals"])
  const lines = doc.lines || []
  const psState = doc.shipTo?.stateCode || doc.customer?.stateCode
  const cancelled = doc.status === "cancelled"
  const hsnCodes = [...new Set(lines.map((l) => l.hsn).filter(Boolean))]
  const number = doc.number || "Draft"


  // NO DATE HERE. The meta block above already prints Date of issue and Valid
  // until as their own labelled rows, and repeating one of them beside the
  // amount made the sheet answer the same question twice. What the line adds
  // that the rows cannot is the STANDING — expired, cancelled — so that is all
  // it keeps.
  const headline = (() => {
    const total = formatCurrency(t.grandTotal || 0)
    if (cancelled) return `${total} cancelled`
    const d = doc.validUntil ? daysUntil(doc.validUntil) : null
    return d != null && d < 0 ? `${total} quoted, now expired` : `${total} quoted`
  })()

  // Meta block: label / value pairs, lead row semibold, matching DocumentSheet.
  const meta: { k: string; v: string; strong?: boolean }[] = [
    { k: "Quotation number", v: number, strong: true },
    { k: "Date of issue", v: formatDate(doc.issueDate) },
    { k: "Valid until", v: doc.validUntil ? formatDate(doc.validUntil) : "-" },
    { k: "Place of supply", v: psState ? stateLabel(psState) : "-" },
    { k: "GSTIN", v: c.gstin || "-" },
  ]
  // WHO QUOTED IT, as a labelled row with the rest of the facts rather than a
  // sentence in the footer: it is a fact about the document, the same kind of
  // thing as the place of supply, and a reader looking for "who do I ring" scans
  // this block, not the small print under the totals.
  if (doc.showSeller && doc.sellerName) meta.push({ k: "Seller Name", v: doc.sellerName })
  if (doc.paymentTerms) meta.push({ k: "Payment terms", v: doc.paymentTerms })

  // The registered address (else the old single string). A dispatch address is
  // stacked under it in the same column, so the parties row keeps its two or
  // three columns. MIRROR of the console's DocumentSheet.
  const registered = registeredLines(c)
  const structured = !!c.registeredAddress && registered.length > 0
  const supplierAddress = registered.map((l) => `<div>${esc(l)}</div>`).join("")
  const dispatch = dispatchBlock(c)
  const dispatchHtml = dispatch
    ? `<div class="doc-party-sub"><div class="doc-party-label">${esc(dispatch.title)}</div>${dispatch.lines
        .map((l) => `<div>${esc(l)}</div>`)
        .join("")}</div>`
    : ""

  const lineRows = lines.length
    ? lines
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
              <div class="doc-item-name">${esc(line.description || "Item")}</div>
              ${detail ? `<div class="doc-item-detail">${esc(detail)}</div>` : ""}
            </td>
            <td>${esc(line.quantity)}${line.unit ? ` ${esc(line.unit)}` : ""}</td>
            <td>${esc(formatCurrency(line.rate))}</td>
            <td>${esc(line.gstRate)}%</td>
            <td>${esc(formatCurrency(cl.taxable))}</td>
          </tr>`
        })
        .join("")
    : // A document with no itemised lines still has to foot — the console's
      // defensive branch for Tally-imported records.
      `<tr>
        <td>
          <div class="doc-item-name">Quotation (aggregate)</div>
          <div class="doc-item-detail">Document without itemised lines</div>
        </td>
        <td>-</td><td>-</td><td>-</td>
        <td>${esc(formatCurrency(t.taxable || 0))}</td>
      </tr>`

  const totals = [
    totalRow("Subtotal", formatCurrency(t.subTotal)),
    t.totalDiscount > 0 ? totalRow("Discount", `-${formatCurrency(t.totalDiscount)}`) : "",
    taxRows(t)
      .map((r) => totalRow(r.label, formatCurrency(r.amount)))
      .join(""),
    t.roundOff ? totalRow("Round off", formatCurrency(t.roundOff)) : "",
    totalRow("Total", formatCurrency(t.grandTotal), true),
  ].join("")

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Quotation ${esc(number)}</title>
<style>
  /* Inter, embedded. One variable file covers the 400 and 600 the sheet uses. */
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 100 900;
    font-display: block;
    src: url(data:font/woff2;base64,${DOCUMENT_FONT_WOFF2_BASE64}) format("woff2");
  }

  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }

  /* Keystone InvoicePdfDocument (QuestPDF), reproduced in points: 30pt page
     margin; body 9pt on 1.5 leading (13.5pt) which sets the vertical rhythm;
     the line-table head rule is solid black, every other rule is #EBEBEB;
     numeric columns right-aligned to the page's right margin. Ink is pure
     black; the only grey in the document is the hairline. */
  .doc-sheet {
    --ink: #000000; --rule: #EBEBEB; --rule-ink: #000000;
    width: 210mm; min-height: 297mm; margin: 0 auto;
    display: flex; flex-direction: column;
    background: #fff; color: var(--ink); padding: 30pt;
    font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 9pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-sheet p, .doc-sheet h4 { margin: 0; }

  /* Masthead: title bottom-aligned left, 24pt-high brand mark top-right. */
  .doc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24pt; }
  .doc-title { align-self: flex-end; font-size: 18pt; font-weight: 600; line-height: 1.2; text-transform: uppercase; }
  .doc-brand { display: flex; align-items: center; gap: 8pt; flex: none; max-width: 60%; }
  .doc-logo { height: 24pt; width: auto; max-width: 160pt; object-fit: contain; flex: none; }

  /* Meta: 85pt label column, value takes the rest. */
  .doc-keys { margin-top: 17pt; display: grid; grid-template-columns: 85pt 1fr; font-size: 9pt; font-weight: 500; max-width: 340pt; }
  .doc-keys .strong { font-weight: 600; }

  /* Parties: supplier left, buyer right (20pt gutter); names semibold. */
  .doc-parties { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20pt; row-gap: 12pt; margin-top: 17.5pt; }
  .doc-parties.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .doc-party { font-size: 9pt; line-height: 1.5; }
  .doc-party-label, .doc-party-name { font-weight: 600; }
  .doc-party-sub { margin-top: 6pt; }

  /* Headline: the amount, stated once at reading size. */
  .doc-headline { margin-top: 24.5pt; font-size: 13.5pt; font-weight: 600; line-height: 1.5; }

  /* Line table: 7.5pt head, one 0.75pt black rule, unruled rows. */
  .doc-table { width: 100%; border-collapse: collapse; margin-top: 26.5pt; table-layout: fixed; }
  .doc-table thead th { text-align: right; font-weight: 400; font-size: 7.5pt; line-height: 1.5; padding: 0 0 5.7pt 0; border-bottom: 0.75pt solid var(--rule-ink); white-space: nowrap; }
  .doc-table thead th:first-child { text-align: left; }
  .doc-table col.c-qty { width: 40pt; }
  .doc-table col.c-unit { width: 92pt; }
  .doc-table col.c-tax { width: 52pt; }
  .doc-table col.c-amt { width: 96pt; }
  .doc-table tbody td { text-align: right; font-size: 9pt; line-height: 1.5; padding: 9pt 0 0 0; vertical-align: top; border: 0; white-space: nowrap; }
  .doc-table tbody tr:first-child td { padding-top: 4.8pt; }
  .doc-table tbody td:first-child { text-align: left; padding-right: 12pt; white-space: normal; }

  /* Totals: right half (266pt), each row carries a hairline above it. */
  .doc-after { display: flex; justify-content: flex-end; margin-top: 16.5pt; }
  .doc-totals { width: 266pt; flex: none; }
  .doc-total-row { display: flex; justify-content: space-between; gap: 12pt; padding: 1.8pt 0 3.7pt; font-size: 9pt; line-height: 1.5; border-top: 0.75pt solid var(--rule); }
  .doc-total-row span:first-child { width: 150pt; flex: none; }
  .doc-total-row span:last-child { flex: 1; text-align: right; }
  .doc-total-row.grand { font-weight: 600; }

  /* Notes: HSN/SAC, declaration, then the document's own text. */
  .doc-notes { margin-top: 25pt; padding-bottom: 14pt; font-size: 9pt; }
  .doc-notes h4 { font-size: 9pt; font-weight: 600; margin-top: 11.5pt; }
  .doc-notes p { white-space: pre-wrap; }

  /* Terms left, the To Pay box right, tinted so the payee is found at a glance. */
  .doc-terms-row { display: flex; align-items: flex-start; gap: 20pt; }
  .doc-terms { flex: 1; min-width: 0; }
  .doc-bank { width: 220pt; flex: none; margin-top: 11.5pt; padding: 8pt 10pt; background: #F4F6FA; border-left: 2.5pt solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-bank h4 { margin-top: 0; margin-bottom: 5pt; font-size: 9pt; font-weight: 600; }
  .doc-bank dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; column-gap: 8pt; row-gap: 1.5pt; }
  .doc-bank dt { font-weight: 400; font-size: 7.5pt; line-height: 13.5pt; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc-bank dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

  /* Footer: hairline, 7.5pt, pinned to the bottom of the sheet. */
  .doc-foot { margin-top: auto; padding-top: 6pt; border-top: 0.75pt solid var(--rule); display: flex; justify-content: space-between; gap: 12pt; font-size: 7.5pt; line-height: 1.5; }
</style>
</head>
<body>
  <div class="doc-sheet">
    <div class="doc-head">
      <div class="doc-title">Quotation</div>
      <div class="doc-brand">
        <img class="doc-logo" src="${mastheadLogo(doc, c, logo)}" alt="${esc(c.name)}" />
      </div>
    </div>

    <div class="doc-keys">
      ${meta
        .map(
          (m) =>
            `<span class="k${m.strong ? " strong" : ""}">${esc(m.k)}</span><span class="v${
              m.strong ? " strong" : ""
            }">${esc(m.v)}</span>`,
        )
        .join("")}
    </div>

    <div class="doc-parties${doc.shipTo ? " three" : ""}">
      <div class="doc-party">
        <div class="doc-party-name">${esc(c.name)}</div>
        ${supplierAddress}
        ${c.email ? `<div>${esc(c.email)}</div>` : ""}
        ${c.phone ? `<div>${esc(c.phone)}</div>` : ""}
        ${c.gstin ? `<div>GSTIN ${esc(c.gstin)}</div>` : ""}
        ${c.stateCode && !structured ? `<div>State: ${esc(stateLabel(c.stateCode))}</div>` : ""}
        ${dispatchHtml}
      </div>
      <div class="doc-party">
        <div class="doc-party-label">Quotation for</div>
        ${party(doc.customer, true)}
      </div>
      ${
        doc.shipTo
          ? `<div class="doc-party"><div class="doc-party-label">Ship to</div>${party(doc.shipTo)}</div>`
          : ""
      }
    </div>

    <div class="doc-headline">${esc(headline)}</div>

    <table class="doc-table">
      <colgroup>
        <col />
        <col class="c-qty" />
        <col class="c-unit" />
        <col class="c-tax" />
        <col class="c-amt" />
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
      <tbody>${lineRows}</tbody>
    </table>

    <div class="doc-after">
      <div class="doc-totals">${totals}</div>
    </div>

    <div class="doc-notes">
      ${hsnCodes.length ? `<p>HSN/SAC: ${esc(hsnCodes.join(", "))}</p>` : ""}
      <p>Amount in words: ${esc(amountInWords(t.grandTotal || 0))}</p>
      ${
        doc.terms || c.bankName
          ? `<div class="doc-terms-row"><div class="doc-terms">${
              doc.terms ? `<h4>Terms and conditions</h4><p>${esc(doc.terms)}</p>` : ""
            }</div>${c.bankName ? bankBox(c) : ""}</div>`
          : ""
      }
      ${doc.notes ? `<h4>Notes</h4><p>${esc(doc.notes)}</p>` : ""}
    </div>

    <div class="doc-foot">
      <span>${esc(settings.documents?.quotationFooter || "")}</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`
}
