// Payments, phone against console: the methods offered, the totals strip and
// the "this UTR is already recorded" check must agree, or the two screens show
// different money for the same ledger.
//
// Console sources: PAYMENT_METHODS (Admin src/data/domain/schema.js) and the
// sure branch of findDuplicate (Admin src/lib/paymentReader.js), loaded
// directly. The console's totals live inside pages/Payments.jsx (a component,
// not exported), so they are COPIED below; keep that copy in step with it.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const adminSchema = await loadModule(resolve(here, "../../Ortex.Admin/src/data/domain/schema.js"))
const adminReader = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/paymentReader.js"))
const mobileSchema = await loadTs("domain/schema.ts")
const p = await loadTs("features/payments/payments.ts")

const round2 = (n) => Math.round(n * 100) / 100
// Copy of the totals useMemo in Ortex.Admin/src/pages/Payments.jsx.
function consoleTotals(items) {
  const ins = items.filter((x) => x.type === "inflow")
  const outs = items.filter((x) => x.type === "payout")
  const inflow = round2(ins.reduce((s, x) => s + (Number(x.amount) || 0), 0))
  const payout = round2(outs.reduce((s, x) => s + (Number(x.amount) || 0), 0))
  return {
    inflow,
    payout,
    net: round2(inflow - payout),
    count: { all: items.length, inflow: ins.length, payout: outs.length },
  }
}

const ledger = [
  // A legacy row whose amount was stored as text still counts the same way.
  { id: "s1", type: "inflow", amount: "250.5", reference: "", date: "2026-10-01T06:30:00Z" },
  {
    id: "1",
    number: "PAY-1",
    type: "inflow",
    amount: 453.1,
    method: "UPI",
    date: "2026-09-03T06:30:00.000Z",
    reference: "624605623703",
    party: "Ram",
  },
  {
    id: "2",
    number: "PAY-2",
    type: "inflow",
    amount: 236000.2,
    method: "RTGS",
    date: "2026-09-28T06:30:00.000Z",
    reference: "HDFCN52026092812",
    party: "Neha",
  },
  {
    id: "3",
    number: "PAY-3",
    type: "payout",
    amount: 5000.05,
    method: "Cash",
    date: "2026-09-29T06:30:00.000Z",
    reference: "",
    party: "Sharma",
  },
  {
    id: "4",
    number: "PAY-4",
    type: "payout",
    amount: 0.1,
    method: "Other",
    date: "2026-09-29T06:30:00.000Z",
    reference: "AB-12",
    party: "X",
  },
]

test("payment methods are the console's, in its order", () => {
  assert.deepEqual([...mobileSchema.PAYMENT_METHODS], [...adminSchema.PAYMENT_METHODS])
  for (const m of adminSchema.PAYMENT_METHODS)
    if (m !== "Other") assert.ok(p.METHOD_ICON[m], `no glyph for ${m}`)
})

test("totals agree with the console's strip", () => {
  assert.deepEqual(p.paymentTotals(ledger), consoleTotals(ledger))
  assert.deepEqual(p.paymentTotals([]), consoleTotals([]))
})

test("same reference agrees with the console's sure duplicate", () => {
  for (const ref of ["6246 0562 3703", "hdfcn52026092812", "ab12", "AB-12", "", "12345", "999999999999"]) {
    const sure = adminReader.findDuplicate({ reference: ref }, ledger)
    assert.equal(p.sameReference(ref, ledger)?.id ?? null, sure?.sure ? sure.payment.id : null, ref)
  }
})
