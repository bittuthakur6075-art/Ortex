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

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// ISO date / Date -> Tally's YYYYMMDD
const tallyDate = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
}

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
     <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${tallyDate(invoice.issueDate)}</DATE>
      <EFFECTIVEDATE>${tallyDate(invoice.issueDate)}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(invoice.number)}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>
      <PARTYNAME>${esc(party)}</PARTYNAME>
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
${entry(party, -debitTotal, true, invoice.number, debitTotal)}${entry(L.sales, t.taxable, false)}${gstLines}${roundOff ? entry(L.roundOff, roundOff, roundOff < 0) : ""}     </VOUCHER>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "Vouchers", msg)
}

// A payment (inflow) -> Receipt Voucher: debit cash/bank, credit the party.
export function receiptVoucherXml(payment, cfg) {
  const party = payment.customer?.company || payment.customer?.name || payment.party || "Cash"
  const amt = Number(payment.amount || 0)
  const acct = payment.account || cfg.ledgers.receiptAccount
  const msg = `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <DATE>${tallyDate(payment.date)}</DATE>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      ${payment.reference ? `<REFERENCE>${esc(payment.reference)}</REFERENCE>` : ""}
${entry(acct, -amt, true)}${entry(party, amt, false, payment.invoiceNumber, amt)}     </VOUCHER>
    </TALLYMESSAGE>`
  return envelope(cfg.tally.company, "Vouchers", msg)
}

// One ledger entry line. `amount` sign: negative = debit. `deemedPositive`
// marks the debit side. Optional bill allocation ties it to an invoice number.
function entry(ledger, amount, deemedPositive, billRef, billAmount) {
  const bill = billRef
    ? `
       <BILLALLOCATIONS.LIST>
        <NAME>${esc(billRef)}</NAME>
        <BILLTYPE>New Ref</BILLTYPE>
        <AMOUNT>${money(deemedPositive ? -Math.abs(billAmount) : Math.abs(billAmount))}</AMOUNT>
       </BILLALLOCATIONS.LIST>`
    : ""
  return `      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${esc(ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${deemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
       <AMOUNT>${money(amount)}</AMOUNT>${bill}
      </ALLLEDGERENTRIES.LIST>
`
}
