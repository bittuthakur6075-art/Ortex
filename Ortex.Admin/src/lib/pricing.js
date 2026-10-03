import { round2 } from "./format"

// Central pricing + GST engine, shared by quotations and invoices so a quote
// and the invoice it converts to always total identically.
//
// A line item: { description, hsn, quantity, rate, discountPercent, gstRate }

// Per-line math: gross → line discount → taxable → GST amount.
export function computeLine(line) {
  const quantity = Number(line.quantity) || 0
  const rate = Number(line.rate) || 0
  const discountPercent = Number(line.discountPercent) || 0
  const gstRate = Number(line.gstRate) || 0

  const gross = round2(quantity * rate)
  const discount = round2((gross * discountPercent) / 100)
  const taxable = round2(gross - discount)
  const gstAmount = round2((taxable * gstRate) / 100)
  const total = round2(taxable + gstAmount)

  return { gross, discount, taxable, gstRate, gstAmount, total }
}

// Document totals.
//
// `interState` decides the GST split: within the same state the tax is halved
// into CGST + SGST; across states it is a single IGST. `extraDiscount` is an
// optional whole-document discount applied after line discounts, before tax is
// recomputed proportionally.
export function computeDocument(lines = [], { interState = false, extraDiscountPercent = 0, roundOff = true } = {}) {
  const computed = lines.map(computeLine)

  const subTotal = round2(computed.reduce((s, l) => s + l.gross, 0))
  const lineDiscount = round2(computed.reduce((s, l) => s + l.discount, 0))
  let taxable = round2(computed.reduce((s, l) => s + l.taxable, 0))

  // Whole-document discount spread proportionally across taxable value.
  const docDiscount = round2((taxable * (Number(extraDiscountPercent) || 0)) / 100)
  const factor = taxable > 0 ? (taxable - docDiscount) / taxable : 1
  taxable = round2(taxable - docDiscount)

  // Re-apply the discount factor to each line's tax so GST is charged on the
  // actually-discounted taxable value, and bucket by rate for the tax summary.
  const taxByRate = {}
  let gstTotal = 0
  computed.forEach((l) => {
    const adjTax = round2(l.gstAmount * factor)
    gstTotal = round2(gstTotal + adjTax)
    if (l.gstRate > 0) {
      taxByRate[l.gstRate] = round2((taxByRate[l.gstRate] || 0) + adjTax)
    }
  })

  const cgst = interState ? 0 : round2(gstTotal / 2)
  const sgst = interState ? 0 : round2(gstTotal - cgst)
  const igst = interState ? gstTotal : 0

  const preRound = round2(taxable + gstTotal)
  const rounded = roundOff ? Math.round(preRound) : preRound
  const roundOffAmount = round2(rounded - preRound)

  return {
    lines: computed,
    subTotal,
    lineDiscount,
    docDiscount,
    totalDiscount: round2(lineDiscount + docDiscount),
    taxable,
    taxByRate, // { "18": amount, ... }
    gstTotal,
    cgst,
    sgst,
    igst,
    interState,
    roundOff: roundOffAmount,
    grandTotal: rounded,
  }
}

// The tax lines a document prints. One rate: the classic CGST/SGST or IGST rows
// with the rate derived from the money (imported documents carry no taxByRate).
// Several rates: one row per rate, as a GST tax invoice must show the rate of
// each supply (CGST 9% / SGST 9%, CGST 2.5% / SGST 2.5%; or IGST 18%, IGST 5%).
export function taxRows(t = {}) {
  const pct = (part) => (t.taxable > 0 ? String(Math.round(((part || 0) / t.taxable) * 10000) / 100) : "0")
  const rates = Object.keys(t.taxByRate || {}).map(Number).filter((r) => r > 0 && t.taxByRate[r] > 0).sort((a, b) => b - a)
  if (rates.length <= 1) {
    if (t.interState) return t.igst > 0 ? [{ label: `IGST (${pct(t.igst)}%)`, amount: t.igst }] : []
    return [
      t.cgst > 0 && { label: `CGST (${pct(t.cgst)}%)`, amount: t.cgst },
      t.sgst > 0 && { label: `SGST (${pct(t.sgst)}%)`, amount: t.sgst },
    ].filter(Boolean)
  }
  return rates.flatMap((r) => {
    const amount = t.taxByRate[r]
    if (t.interState) return [{ label: `IGST (${r}%)`, amount }]
    const half = round2(amount / 2)
    return [
      { label: `CGST (${r / 2}%)`, amount: half },
      { label: `SGST (${r / 2}%)`, amount: round2(amount - half) },
    ]
  })
}
