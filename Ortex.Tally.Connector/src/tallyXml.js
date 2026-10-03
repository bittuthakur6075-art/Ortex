// Tally XML builders.
//
// TallyPrime imports masters and vouchers via an "Import Data" ENVELOPE POSTed
// to its XML gateway. Sign convention inside a voucher: a DEBIT is a negative
// AMOUNT with ISDEEMEDPOSITIVE=Yes; a CREDIT is a positive AMOUNT with
// ISDEEMEDPOSITIVE=No. For a sales invoice the party (debtor) is debited by the
// grand total, while Sales + GST ledgers are credited.
//
// Ledger/GST names come from config.ledgers so the XML matches the company's
// actual Tally masters. These builders are validated offline (npm run fixture);
// final correctness must be confirmed against the real Tally company.

// A ledger from ledgers.partyMap, by own key only: a party typed as
// "constructor" or "__proto__" must not resolve to an Object built-in.
const mapped = (map, name) => (map && Object.hasOwn(map, name) ? map[name] : undefined)

const esc = (v) =>
  String(v ?? "")
    // Characters XML 1.0 forbids (Tally would refuse the whole voucher).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// ISO date / Date -> Tally's YYYYMMDD of the IST day. The books are Indian, so
// the day is the Asia/Kolkata calendar day, never the UTC one: 00:30 IST is
// still that day, and both stored shapes (noon IST "...T12:00:00+05:30" and
// older UTC midnight "...T00:00:00Z") land on the day they were recorded for.
const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
export const tallyDate = (iso) => istDay.format(iso ? new Date(iso) : new Date()).replace(/-/g, "")

// Stable identity of a voucher in Tally. A re-post of the same record (e.g. the
// writeback was lost after a successful post) carries the same REMOTEID, so
// Tally matches the voucher it already has instead of adding a duplicate.
const remoteId = (kind, rec) => `ortex-${kind}-${rec.id}`

// Thrown for a record that cannot be booked correctly. The sync marks it
// doc.tally.status = "error" with this message instead of posting it.
export class Refused extends Error {}

const money = (n) => Number(n || 0).toFixed(2)
const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100

// Wrap one or more <TALLYMESSAGE> blocks in the Import envelope for a report.
function envelope(company, reportName, messagesXml) {
  return `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>${esc(reportName)}</REPORTNAME>
    <STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
${messagesXml}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`
}

// A customer -> Sundry Debtors ledger.
export function ledgerXml(customer, cfg) {
  const name = customer.company || customer.name || "Unnamed"
  const msg = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="${esc(name)}" ACTION="Create">
      <NAME>${esc(name)}</NAME>
      <PARENT>${esc(cfg.ledgers.debtorsGroup)}</PARENT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      ${customer.gstin ? `<PARTYGSTIN>${esc(customer.gstin)}</PARTYGSTIN>\n      <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : `<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>`}
      <LEDGERMAILINGDETAILS.LIST>
       <ADDRESS.LIST TYPE="String"><ADDRESS>${esc(customer.address || "")}</ADDRESS></ADDRESS.LIST>
       <STATENAME>${esc(customer.state || "")}</STATENAME>
      </LEDGERMAILINGDETAILS.LIST>
      ${customer.phone ? `<LEDGERPHONE>${esc(customer.phone)}</LEDGERPHONE>` : ""}
      ${customer.email ? `<EMAIL>${esc(customer.email)}</EMAIL>` : ""}
     </LEDGER>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "All Masters", msg)
}

// A product -> Stock Item.
export function stockItemXml(product, cfg) {
  const name = product.name || product.sku || "Unnamed item"
  const msg = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="${esc(name)}" ACTION="Create">
      <NAME>${esc(name)}</NAME>
      <PARENT>${esc(cfg.ledgers.stockGroup)}</PARENT>
      <BASEUNITS>${esc(product.unit || "Nos")}</BASEUNITS>
      ${product.hsn ? `<HSNCODE>${esc(product.hsn)}</HSNCODE>` : ""}
      <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
      <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
      ${product.gstRate != null ? `<RATEOFVAT>${esc(product.gstRate)}</RATEOFVAT>` : ""}
     </STOCKITEM>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "All Masters", msg)
}

// An invoice -> Sales Voucher (accounting invoice with GST split).
export function salesVoucherXml(invoice, cfg) {
  const t = invoice.totals || {}
  const party = invoice.customer?.company || invoice.customer?.name || "Cash"
  const L = cfg.ledgers

  // GST ledger lines depend on intra- vs inter-state supply.
  const gstLines = t.interState
    ? entry(L.igst, t.igst, false)
    : entry(L.cgst, t.cgst, false) + entry(L.sgst, t.sgst, false)
  const roundOff = Number(t.roundOff || 0)

  // Balance by construction: the party debit is the exact sum of the credit
  // lines (Sales + GST + round-off), so the voucher always balances even if a
  // stored grandTotal were somehow inconsistent. Normally this equals grandTotal.
  const gst = Number(t.cgst || 0) + Number(t.sgst || 0) + Number(t.igst || 0)
  const debitTotal = round2(Number(t.taxable || 0) + gst + roundOff)

  const msg = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER REMOTEID="${esc(remoteId("invoice", invoice))}" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${tallyDate(invoice.issueDate)}</DATE>
      <EFFECTIVEDATE>${tallyDate(invoice.issueDate)}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(invoice.number)}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>
      <PARTYNAME>${esc(party)}</PARTYNAME>
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
${entry(party, -debitTotal, true, { type: "New Ref", name: invoice.number })}${entry(L.sales, t.taxable, false)}${gstLines}${roundOff ? entry(L.roundOff, roundOff, roundOff < 0) : ""}     </VOUCHER>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "Vouchers", msg)
}

const paymentLabel = (payment) => payment.number || payment.reference || payment.id

// Receipt and Payment vouchers share everything but the type and the lines.
function paymentVoucher(vchType, payment, cfg, lines) {
  const msg = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER REMOTEID="${esc(remoteId("payment", payment))}" VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${tallyDate(payment.date)}</DATE>
      <EFFECTIVEDATE>${tallyDate(payment.date)}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
      ${payment.number ? `<VOUCHERNUMBER>${esc(payment.number)}</VOUCHERNUMBER>` : ""}
      ${payment.reference ? `<REFERENCE>${esc(payment.reference)}</REFERENCE>` : ""}
      ${payment.note ? `<NARRATION>${esc(payment.note)}</NARRATION>` : ""}
${lines}     </VOUCHER>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "Vouchers", msg)
}

// A payment (inflow) -> Receipt Voucher: debit cash/bank, credit the party.
// The party is the linked customer's ledger (company || name, as ledgerXml
// created it), else the free-text party; ledgers.partyMap renames either to
// the real Tally ledger. Against an invoice the credit settles that bill
// ("Agst Ref" to the sales voucher's "New Ref"); with no invoice it is an
// advance, "On Account", which the accountant can later set against a bill.
export function receiptVoucherXml(payment, cfg) {
  const name = String(payment.customer?.company || payment.customer?.name || payment.party || "").trim()
  const party = mapped(cfg.ledgers.partyMap, name) || name
  const amt = Number(payment.amount || 0)
  // A legacy row whose amount is not a positive number cannot be booked.
  // A JSON number only: a legacy text amount ("100") would post but could never
  // be stamped back, and so would be posted again on every pass.
  if (typeof payment.amount !== "number" || !(amt > 0)) throw new Refused(`${paymentLabel(payment)}: the amount is not a number above 0. Correct it in the console.`)
  // Only the configured account: a doc field could name any ledger in the books.
  const acct = cfg.ledgers.receiptAccount
  if (!party) throw new Refused(`Receipt ${paymentLabel(payment)} has no customer or party, so there is no ledger to credit. Link it to a customer.`)
  if (party === acct) throw new Refused(`Receipt ${paymentLabel(payment)}: party "${party}" is the receipt account itself. Link it to a customer or map the party in ledgers.partyMap.`)
  const bill = payment.invoiceNumber ? { type: "Agst Ref", name: payment.invoiceNumber } : { type: "On Account" }
  return paymentVoucher("Receipt", payment, cfg, entry(acct, -amt, true) + entry(party, amt, false, bill))
}

// A payout -> Payment Voucher: credit cash/bank (ledgers.payoutAccount), debit
// the party's ledger from ledgers.partyMap, else the ledgers.payoutDefault
// expense ledger. Free text is never used as a ledger name: payees are rarely
// Tally masters, and an unknown ledger would fail every pass.
export function paymentVoucherXml(payment, cfg) {
  const L = cfg.ledgers
  const name = String(payment.party || payment.customer?.company || payment.customer?.name || "").trim()
  const debit = mapped(L.partyMap, name) || L.payoutDefault
  const amt = Number(payment.amount || 0)
  // A legacy row whose amount is not a positive number cannot be booked.
  // A JSON number only: a legacy text amount ("100") would post but could never
  // be stamped back, and so would be posted again on every pass.
  if (typeof payment.amount !== "number" || !(amt > 0)) throw new Refused(`${paymentLabel(payment)}: the amount is not a number above 0. Correct it in the console.`)
  const acct = L.payoutAccount || L.receiptAccount
  if (!debit) throw new Refused(`Payout ${paymentLabel(payment)} to "${name}" has no Tally ledger. Add the party to ledgers.partyMap or set ledgers.payoutDefault.`)
  if (debit === acct) throw new Refused(`Payout ${paymentLabel(payment)}: ledger "${debit}" is the payout account itself. Fix ledgers.partyMap or ledgers.payoutDefault.`)
  return paymentVoucher("Payment", payment, cfg, entry(debit, -amt, true) + entry(acct, amt, false))
}

// One ledger entry line. `amount` sign: negative = debit. `deemedPositive`
// marks the debit side. Optional bill allocation { type, name } carries the
// same signed amount: "New Ref" opens a bill, "Agst Ref" settles it, "On
// Account" (no name) is an unallocated advance.
function entry(ledger, amount, deemedPositive, billAlloc) {
  const bill = billAlloc
    ? `
       <BILLALLOCATIONS.LIST>${billAlloc.name ? `
        <NAME>${esc(billAlloc.name)}</NAME>` : ""}
        <BILLTYPE>${billAlloc.type}</BILLTYPE>
        <AMOUNT>${money(amount)}</AMOUNT>
       </BILLALLOCATIONS.LIST>`
    : ""
  return `      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${esc(ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${deemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
       <AMOUNT>${money(amount)}</AMOUNT>${bill}
      </ALLLEDGERENTRIES.LIST>
`
}
