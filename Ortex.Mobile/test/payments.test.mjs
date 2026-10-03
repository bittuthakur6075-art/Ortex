// Payments on the phone, the pure half (src/features/payments/payments.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const p = await loadTs("features/payments/payments.ts")

const ledger = [
  { id: "1", number: "PAY-2627-0001", type: "inflow", amount: 453, method: "UPI", date: "2026-09-03T04:47:00.000Z", reference: "624605623703", party: "RAMSHANKAR PRASAD THAKUR", note: "Paid by Google Pay" },
  { id: "2", number: "PAY-2627-0002", type: "inflow", amount: 236000, method: "Bank transfer / NEFT", date: "2026-09-28T05:35:00.000Z", reference: "HDFCN52026092812", party: "NEHA GUPTA", note: "" },
  { id: "3", number: "PAY-2627-0003", type: "payout", amount: 5000, method: "UPI", date: "2026-09-29T08:45:00.000Z", reference: "427099887766", party: "Sharma Traders", note: "" },
]

test("totals: received, paid out, net and counts", () => {
  assert.deepEqual(p.paymentTotals(ledger), { inflow: 236453, payout: 5000, net: 231453, count: { all: 3, inflow: 2, payout: 1 } })
  assert.deepEqual(p.paymentTotals([]).count, { all: 0, inflow: 0, payout: 0 })
})

test("visible: newest first, by direction and search", () => {
  assert.deepEqual(p.visiblePayments(ledger, "all").map((x) => x.id), ["3", "2", "1"])
  assert.deepEqual(p.visiblePayments(ledger, "payout").map((x) => x.id), ["3"])
  assert.deepEqual(p.visiblePayments(ledger, "all", "neha").map((x) => x.id), ["2"])
  assert.deepEqual(p.visiblePayments(ledger, "all", "6246").map((x) => x.id), ["1"])
})

test("same reference ignores spaces and case, and short ones", () => {
  assert.equal(p.sameReference("6246 0562 3703", ledger)?.id, "1")
  assert.equal(p.sameReference("hdfcn52026092812", ledger)?.id, "2")
  assert.equal(p.sameReference("12", ledger), null)
  assert.equal(p.sameReference("999999999999", ledger), null)
})

test("blocker says the one missing thing", () => {
  const d = { type: "inflow", amount: "", party: "", method: "UPI", date: "2026-10-02", reference: "", note: "" }
  assert.equal(p.paymentBlocker(d), "Enter the amount.")
  assert.equal(p.paymentBlocker({ ...d, amount: "1,200" }), "Enter who paid.")
  assert.equal(p.paymentBlocker({ ...d, type: "payout", amount: "1200" }), "Enter who was paid.")
  assert.equal(p.paymentBlocker({ ...d, amount: "1200", party: "Amit" }), null)
  assert.equal(p.amountOf("1,23,456.50"), 123456.5)
  assert.equal(p.amountOf("abc"), 0)
})

test("decimal comma is refused, not read as a hundred times the money", () => {
  const d = { type: "inflow", amount: "", party: "Amit", method: "UPI", date: "2026-10-02", reference: "", note: "" }
  for (const s of ["1500,50", "1500,5", "1,23,456,50"]) {
    assert.equal(p.decimalComma(s), true, s)
    assert.equal(p.amountOf(s), 0, s)
    assert.match(p.paymentBlocker({ ...d, amount: s }), /full stop/)
  }
  for (const s of ["1,500", "1,50,050", "1500.50", "1,23,456.50"]) assert.equal(p.decimalComma(s), false, s)
  assert.equal(p.amountOf("1,50,050"), 150050)
})

test("amount limits: the crore confirmation and the database ceiling", () => {
  const d = { type: "inflow", amount: "", party: "Amit", method: "UPI", date: "2026-10-02", reference: "", note: "" }
  assert.equal(p.BIG_AMOUNT, 1e7)
  assert.equal(p.paymentBlocker({ ...d, amount: "9999999999.99" }), null)
  assert.match(p.paymentBlocker({ ...d, amount: "10000000000" }), /too large/)
})

test("payment day is the IST day of the stored instant", () => {
  // 00:10 IST on 3 Oct is still 2 Oct in UTC.
  assert.equal(p.paymentDay("2026-10-02T18:40:00.000Z"), "03 Oct 2026")
  assert.equal(p.paymentDay(new Date("2026-10-02T12:00:00+05:30").toISOString()), "02 Oct 2026")
  assert.equal(p.paymentDay("nonsense"), "-")
})

test("justSaved finds the row a lost answer wrote, and only a fresh one", () => {
  const now = Date.parse("2026-10-02T07:00:00Z")
  const d = { type: "inflow", amount: "1,500.50", party: " amit ", method: "UPI", date: "2026-10-02", reference: "", note: "" }
  const row = { id: "9", number: "PAY-9", type: "inflow", amount: 1500.5, method: "UPI", date: "2026-10-02T06:30:00.000Z", reference: "", party: "Amit", note: "", createdAt: "2026-10-02T06:59:30Z" }
  assert.equal(p.justSaved(d, [row], now)?.id, "9")
  assert.equal(p.justSaved(d, [{ ...row, createdAt: "2026-10-02T06:50:00Z" }], now), null)
  assert.equal(p.justSaved({ ...d, amount: "1500" }, [row], now), null)
  assert.equal(p.justSaved({ ...d, amount: "1", reference: "UTR 123456" }, [{ ...row, reference: "utr123456" }], now)?.id, "9")
  // A row already in the ledger before Save is never taken for this one.
  assert.equal(p.justSaved(d, [row], now, new Set(["9"])), null)
})
