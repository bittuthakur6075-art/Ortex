// Offline check of the connector: no Tally, no Supabase. Feeds sample records
// (shaped like the admin's Supabase docs) through each XML builder, prints the
// XML so it can be eyeballed, and asserts balance, bill allocations, voucher
// identity, IST dates and refusals. Also drives runSync and the writeback
// against in-memory fakes. Run: npm run fixture
import assert from "node:assert/strict"
import { ledgerXml, stockItemXml, salesVoucherXml, receiptVoucherXml, paymentVoucherXml, tallyDate, Refused } from "../src/tallyXml.js"
import { makeSource } from "../src/source.js"
import { runSync } from "../src/sync.js"

const cfg = {
  tally: { company: "Ortex Industries", url: "http://fake" },
  ledgers: {
    sales: "Sales", cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST",
    roundOff: "Round Off", debtorsGroup: "Sundry Debtors", stockGroup: "Primary", receiptAccount: "Cash",
    payoutAccount: "HDFC Bank", payoutDefault: "Miscellaneous Expenses",
    partyMap: { "Shree Packaging": "Shree Packaging (Creditor)", "Walk-in": "Walk-in Debtor" },
  },
  sync: { customers: true, products: true, invoices: true, payments: true, payouts: true, retryAfterMinutes: 60 },
}

const customer = { name: "Karan Mehta", company: "StartupX Pvt Ltd", gstin: "07AABCS1234K1Z9", state: "Delhi", email: "karan@startupx.in", phone: "+91-98100-00000", address: "Connaught Place, New Delhi" }
const product = { name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", unit: "Nos", hsn: "4420", gstRate: 18 }
const invoiceIntra = {
  id: "inv-1", number: "INV-2627-0005", issueDate: "2026-07-05", status: "sent",
  customer, totals: { taxable: 25200, cgst: 2268, sgst: 2268, igst: 0, roundOff: 0, grandTotal: 29736, interState: false },
}
const invoiceInter = {
  id: "inv-2", number: "INV-2627-0006", issueDate: "2026-07-05", status: "sent",
  customer: { ...customer, state: "Maharashtra", gstin: "27AABCS1234K1Z9" },
  // Fractional GST → a real round-off: 9999 + 1799.82 + 0.18 = 11799.00
  totals: { taxable: 9999, cgst: 0, sgst: 0, igst: 1799.82, roundOff: 0.18, grandTotal: 11799, interState: true },
}
const linked = { id: "pay-1", number: "PAY-2627-0012", reference: "UPI-778812", date: "2026-07-05T12:00:00+05:30", amount: 29736, type: "inflow", invoiceId: "inv-1", invoiceNumber: "INV-2627-0005", customer, party: "Karan Mehta", account: "HDFC Bank" }
const unlinked = { id: "pay-2", number: "PAY-2627-0013", reference: "NEFT-1", date: "2026-07-06T00:00:00.000Z", amount: 5000, type: "inflow", invoiceNumber: "", customer: null, party: "Walk-in" }
const payout = { id: "pay-3", number: "PAY-2627-0014", reference: "CHQ-0041", date: "2026-10-03T00:30:00+05:30", amount: 1200, type: "payout", party: "Shree Packaging", note: "Corrugated boxes" }
const payoutUnmapped = { ...payout, id: "pay-4", party: "Courier guy" }

// Sum the ledger-level AMOUNTs of a voucher (ignoring nested bill allocations).
// A valid Tally voucher must net to zero: debits (negative) cancel credits.
function balance(xml) {
  const amounts = [...xml.matchAll(/<ISDEEMEDPOSITIVE>\w+<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]))
  return Math.round(amounts.reduce((s, n) => s + n, 0) * 100) / 100
}
const bills = (xml) => [...xml.matchAll(/<BILLALLOCATIONS\.LIST>([\s\S]*?)<\/BILLALLOCATIONS\.LIST>/g)].map((m) => m[1].replace(/\s+/g, ""))

const checks = []
const check = (name, fn) => checks.push([name, fn])
const show = (title, xml, voucher) => {
  console.log(`\n===== ${title} =====\n${xml}`)
  if (voucher) check(`${title}: balanced`, () => assert.ok(balance(xml) === 0, `net ${balance(xml)}`)) // === so -0 passes
  return xml
}

show("Customer → Ledger", ledgerXml(customer, cfg))
show("Product → Stock Item", stockItemXml(product, cfg))
const intra = show("Invoice (intra-state, CGST+SGST) → Sales Voucher", salesVoucherXml(invoiceIntra, cfg), true)
show("Invoice (inter-state, IGST + round-off) → Sales Voucher", salesVoucherXml(invoiceInter, cfg), true)
const rLinked = show("Payment linked to an invoice → Receipt Voucher", receiptVoucherXml(linked, cfg), true)
const rUnlinked = show("Payment with no invoice → Receipt Voucher", receiptVoucherXml(unlinked, cfg), true)
const pOut = show("Payout → Payment Voucher", paymentVoucherXml(payout, cfg), true)

check("sales voucher: VOUCHERNUMBER, REMOTEID, New Ref", () => {
  assert.match(intra, /<VOUCHER REMOTEID="ortex-invoice-inv-1" VCHTYPE="Sales"/)
  assert.match(intra, /<VOUCHERNUMBER>INV-2627-0005<\/VOUCHERNUMBER>/)
  assert.deepEqual(bills(intra), ["<NAME>INV-2627-0005</NAME><BILLTYPE>NewRef</BILLTYPE><AMOUNT>-29736.00</AMOUNT>"])
})
check("linked receipt: Agst Ref settles the invoice, credits the customer ledger", () => {
  assert.match(rLinked, /<VOUCHER REMOTEID="ortex-payment-pay-1" VCHTYPE="Receipt"/)
  assert.match(rLinked, /<VOUCHERNUMBER>PAY-2627-0012<\/VOUCHERNUMBER>/)
  assert.match(rLinked, /<LEDGERNAME>StartupX Pvt Ltd<\/LEDGERNAME>/)
  assert.deepEqual(bills(rLinked), ["<NAME>INV-2627-0005</NAME><BILLTYPE>AgstRef</BILLTYPE><AMOUNT>29736.00</AMOUNT>"])
  assert.match(rLinked, /<DATE>20260705<\/DATE>/)
})
check("unlinked receipt: On Account, party mapped through partyMap", () => {
  assert.deepEqual(bills(rUnlinked), ["<BILLTYPE>OnAccount</BILLTYPE><AMOUNT>5000.00</AMOUNT>"])
  assert.match(rUnlinked, /<LEDGERNAME>Walk-in Debtor<\/LEDGERNAME>/)
  assert.match(rUnlinked, /<DATE>20260706<\/DATE>/) // old UTC-midnight row
})
check("payout: Payment voucher, debit mapped party, credit payout account", () => {
  assert.match(pOut, /<VOUCHER REMOTEID="ortex-payment-pay-3" VCHTYPE="Payment"/)
  assert.match(pOut, /<VOUCHERNUMBER>PAY-2627-0014<\/VOUCHERNUMBER>/)
  assert.match(pOut, /<LEDGERNAME>Shree Packaging \(Creditor\)<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-1200.00<\/AMOUNT>/)
  assert.match(pOut, /<LEDGERNAME>HDFC Bank<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>1200.00<\/AMOUNT>/)
  assert.match(pOut, /<DATE>20261003<\/DATE>/)
  assert.match(paymentVoucherXml(payoutUnmapped, cfg), /<LEDGERNAME>Miscellaneous Expenses<\/LEDGERNAME>/)
})
check("IST dates", () => {
  assert.equal(tallyDate("2026-10-03T00:30:00+05:30"), "20261003")
  assert.equal(tallyDate("2026-10-03T12:00:00+05:30"), "20261003")
  assert.equal(tallyDate("2026-10-03T00:00:00.000Z"), "20261003")
  assert.equal(tallyDate("2026-10-03"), "20261003")
  assert.equal(tallyDate("2026-10-02T19:00:00Z"), "20261003") // 00:30 IST next day
})
check("refusals: no party, party = receipt account, payout with no ledger", () => {
  assert.throws(() => receiptVoucherXml({ ...unlinked, party: "" }, cfg), Refused)
  assert.throws(() => receiptVoucherXml({ ...unlinked, party: "Cash" }, cfg), /is the receipt account itself/)
  // A doc field cannot pick the bank ledger: only the configured account is used.
  assert.ok(!receiptVoucherXml({ ...linked, account: "Capital Account" }, cfg).includes("Capital Account"))
  assert.ok(!paymentVoucherXml({ ...payout, account: "Capital Account" }, cfg).includes("Capital Account"))
  // A legacy amount that is not a positive number is refused, not booked.
  assert.throws(() => receiptVoucherXml({ ...linked, amount: "1,000" }, cfg), /not a number above 0/)
  assert.throws(() => paymentVoucherXml({ ...payout, amount: -5 }, cfg), /not a number above 0/)
  assert.throws(() => receiptVoucherXml({ ...linked, amount: "100" }, cfg), /not a number above 0/)
  // partyMap is read by own key only.
  assert.throws(() => paymentVoucherXml({ ...payoutUnmapped, party: "constructor" }, { ...cfg, ledgers: { ...cfg.ledgers, payoutDefault: undefined } }), /has no Tally ledger/)
  // XML-illegal control characters are dropped from text.
  assert.ok(!receiptVoucherXml({ ...linked, reference: "UTR\u0001 1" }, cfg).includes("\u0001"))
  assert.throws(() => paymentVoucherXml(payoutUnmapped, { ...cfg, ledgers: { ...cfg.ledgers, payoutDefault: undefined } }), /has no Tally ledger/)
  assert.throws(() => paymentVoucherXml(payout, { ...cfg, ledgers: { ...cfg.ledgers, payoutAccount: "Shree Packaging (Creditor)" } }), Refused)
})

// --- writeback: only doc.tally changes, never a stale doc -------------------
// A tiny in-memory stand-in for the supabase-js calls source.js makes.
function fakeDb({ rpc = true } = {}) {
  const rows = new Map()
  let tick = 0
  const stamp = () => `2026-10-03T00:00:00.${String(++tick).padStart(6, "0")}+00:00`
  const put = (table, id, doc) => rows.set(`${table}/${id}`, { id, doc, updated_at: stamp() })
  const db = {
    rows, put, calls: [],
    async rpc(name, args) {
      db.calls.push(name)
      if (!rpc) return { error: { code: "PGRST202", message: "Could not find the function" } }
      const r = rows.get(`${args.p_table}/${args.p_id}`)
      if (r) put(args.p_table, args.p_id, { ...r.doc, tally: args.p_tally })
      return { data: !!r, error: null }
    },
    from(table) {
      const f = { filters: [], patch: null }
      const q = {
        select: () => q, order: () => q,
        update(patch) { f.patch = patch; return q },
        eq(col, v) { f.filters.push([col, v]); return q },
        range: async () => ({ data: [...rows.entries()].filter(([k]) => k.startsWith(`${table}/`)).map(([, r]) => r), error: null }),
        async maybeSingle() { return { data: rows.get(`${table}/${f.filters[0][1]}`) || null, error: null } },
        then(res, rej) {
          const id = f.filters.find(([c]) => c === "id")[1]
          const r = rows.get(`${table}/${id}`)
          const ok = r && f.filters.every(([c, v]) => r[c] === v)
          if (ok) { db.onUpdate?.(); put(table, id, f.patch.doc) }
          return Promise.resolve({ data: ok ? [{ id }] : [], error: null }).then(res, rej)
        },
      }
      return q
    },
  }
  return db
}

for (const rpc of [true, false]) {
  check(`writeback keeps a concurrent edit (${rpc ? "tally_mark RPC" : "updated_at fallback"})`, async () => {
    const db = fakeDb({ rpc })
    db.put("invoices", "inv-1", { number: "INV-1", status: "sent" })
    const src = makeSource(db)
    const [row] = await src.unsynced("invoices")
    // Someone marks the invoice paid while Tally is posting; in the fallback
    // case the first conditional update finds updated_at moved and re-reads.
    db.put("invoices", "inv-1", { number: "INV-1", status: "paid" })
    await src.writeBack("invoices", row, { ok: true, voucherRef: "INV-1" })
    const doc = db.rows.get("invoices/inv-1").doc
    assert.equal(doc.status, "paid")
    assert.equal(doc.tally.status, "synced")
    assert.equal(db.calls[0], "tally_mark")
  })
}

check("runSync: refused rows are marked error, recent errors wait, payouts export", async () => {
  const db = fakeDb()
  const recent = new Date(Date.now() - 5 * 60000).toISOString()
  db.put("payments", "p-ok", linked)
  db.put("payments", "p-out", payout)
  db.put("payments", "p-cash", { ...unlinked, party: "Cash" })
  db.put("payments", "p-wait", { ...linked, tally: { status: "error", triedAt: recent, error: "Ledger not found" } })
  const posted = []
  const logs = []
  const s = await runSync(cfg, makeSource(db), { log: (l) => logs.push(l), post: async (_u, xml) => (posted.push(xml), { ok: true, created: 1 }) })
  assert.deepEqual({ pushed: s.pushed, failed: s.failed, waiting: s.waiting }, { pushed: 2, failed: 1, waiting: 1 })
  assert.equal(posted.length, 2)
  assert.ok(posted.some((x) => x.includes('VCHTYPE="Payment"')))
  assert.match(db.rows.get("payments/p-cash").doc.tally.error, /receipt account itself/)
  assert.ok(logs.at(-1).includes("waiting 1"))
})

let failures = 0
for (const [name, fn] of checks) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failures++
    console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`)
  }
}

// Exit non-zero on any failure so `npm run fixture` is a real regression gate
// (used by CI) instead of a print-only script.
if (failures > 0) {
  console.error(`\n✗ ${failures} check(s) failed`)
  process.exit(1)
}
console.log(`\n✓ all ${checks.length} checks passed`)
