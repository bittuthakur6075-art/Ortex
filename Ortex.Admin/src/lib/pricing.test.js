import { describe, it, expect } from "vitest"
import { computeDocument, taxRows } from "./pricing"

describe("taxRows: the tax lines a document prints", () => {
  const mixed = [
    { quantity: 500, rate: 42, gstRate: 18 },
    { quantity: 300, rate: 35, gstRate: 5, discountPercent: 5 },
  ]
  it("one row per rate when rates are mixed, never a blended rate", () => {
    const local = computeDocument(mixed)
    expect(taxRows(local).map((r) => r.label)).toEqual(["CGST (9%)", "SGST (9%)", "CGST (2.5%)", "SGST (2.5%)"])
    expect(Math.round(taxRows(local).reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(local.gstTotal)
    expect(taxRows(computeDocument(mixed, { interState: true })).map((r) => r.label)).toEqual(["IGST (18%)", "IGST (5%)"])
  })
  it("one rate keeps the classic rows", () => {
    expect(taxRows(computeDocument([{ quantity: 1, rate: 100, gstRate: 18 }])).map((r) => r.label)).toEqual(["CGST (9%)", "SGST (9%)"])
    expect(taxRows({ taxable: 100, interState: true, igst: 18 })).toEqual([{ label: "IGST (18%)", amount: 18 }])
  })
})
