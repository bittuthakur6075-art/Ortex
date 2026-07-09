// Offline check of the XML builders — no Tally, no Supabase. Feeds sample
// records (shaped like the admin's Supabase docs) through each builder and
// prints the XML so it can be eyeballed / diffed. Run: npm run fixture
import { ledgerXml, stockItemXml, salesVoucherXml, receiptVoucherXml } from "../src/tallyXml.js"

const cfg = {
  tally: { company: "Ortex Industries" },
  ledgers: {
    sales: "Sales", cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST",
    roundOff: "Round Off", debtorsGroup: "Sundry Debtors", stockGroup: "Primary", receiptAccount: "Cash",
  },
}

const customer = { name: "Karan Mehta", company: "StartupX Pvt Ltd", gstin: "07AABCS1234K1Z9", state: "Delhi", email: "karan@startupx.in", phone: "+91-98100-00000", address: "Connaught Place, New Delhi" }
const product = { name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", unit: "Nos", hsn: "4420", gstRate: 18 }
const invoiceIntra = {
  number: "INV-2627-0005", issueDate: "2026-07-05", status: "sent",
  customer, totals: { taxable: 25200, cgst: 2268, sgst: 2268, igst: 0, roundOff: 0, grandTotal: 29736, interState: false },
}
const invoiceInter = {
  number: "INV-2627-0006", issueDate: "2026-07-05", status: "sent",
  customer: { ...customer, state: "Maharashtra", gstin: "27AABCS1234K1Z9" },
  // Fractional GST → a real round-off: 9999 + 1799.82 + 0.18 = 11799.00
  totals: { taxable: 9999, cgst: 0, sgst: 0, igst: 1799.82, roundOff: 0.18, grandTotal: 11799, interState: true },
}
const payment = { reference: "UPI-778812", date: "2026-07-05", amount: 29736, type: "inflow", invoiceNumber: "INV-2627-0005", customer, account: "HDFC Bank" }

// Sum the ledger-level AMOUNTs of a voucher (ignoring nested bill allocations).
// A valid Tally voucher must net to zero — debits (negative) cancel credits.
function balance(xml) {
  const amounts = [...xml.matchAll(/<ISDEEMEDPOSITIVE>\w+<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]))
  return Math.round(amounts.reduce((s, n) => s + n, 0) * 100) / 100
}

let failures = 0

const show = (title, xml, checkBalance) => {
  console.log(`\n===== ${title} =====\n${xml}`)
  if (checkBalance) {
    const b = balance(xml)
    if (b !== 0) failures++
    console.log(`   [balance check] net = ${b}  →  ${b === 0 ? "✓ balanced" : "✗ IMBALANCED"}`)
  }
}

show("Customer → Ledger", ledgerXml(customer, cfg))
show("Product → Stock Item", stockItemXml(product, cfg))
show("Invoice (intra-state, CGST+SGST) → Sales Voucher", salesVoucherXml(invoiceIntra, cfg), true)
show("Invoice (inter-state, IGST + round-off) → Sales Voucher", salesVoucherXml(invoiceInter, cfg), true)
show("Payment → Receipt Voucher", receiptVoucherXml(payment, cfg), true)

// Exit non-zero on any imbalance so `npm run fixture` is a real regression gate
// (used by CI) instead of a print-only script.
if (failures > 0) {
  console.error(`\n✗ ${failures} voucher(s) did not balance`)
  process.exit(1)
}
console.log("\n✓ all voucher balance checks passed")
