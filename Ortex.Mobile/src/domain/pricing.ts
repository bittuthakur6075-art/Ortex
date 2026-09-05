import { round2 } from "@/domain/format"
import type { Line } from "@/domain/schema"

// Central pricing + GST engine.
//
// PORT OF Ortex.Admin/src/lib/pricing.js — line for line. A quotation raised on
// the phone and the same quotation opened in the console must total identically,
// so nothing here may be "improved" without changing the console too.

export type ComputedLine = {
  gross: number
  discount: number
  taxable: number
  gstRate: number
  gstAmount: number
  total: number
}

export type DocumentTotals = {
  lines: ComputedLine[]
  subTotal: number
  lineDiscount: number
  docDiscount: number
  totalDiscount: number
  taxable: number
  taxByRate: Record<string, number>
  gstTotal: number
  cgst: number
  sgst: number
  igst: number
  interState: boolean
  roundOff: number
  grandTotal: number
}

// Per-line math: gross → line discount → taxable → GST amount.
export function computeLine(line: Partial<Line>): ComputedLine {
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
// into CGST + SGST; across states it is a single IGST. `extraDiscountPercent` is
// an optional whole-document discount applied after line discounts, before tax
// is recomputed proportionally.
export function computeDocument(
  lines: Partial<Line>[] = [],
  {
    interState = false,
    extraDiscountPercent = 0,
    roundOff = true,
  }: { interState?: boolean; extraDiscountPercent?: number; roundOff?: boolean } = {},
): DocumentTotals {
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
  const taxByRate: Record<string, number> = {}
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
