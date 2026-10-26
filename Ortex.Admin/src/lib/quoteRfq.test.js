import { describe, it, expect } from "vitest"
import { rfqToQuotationLines } from "./quoteRfq"

const products = [{ id: "p1", sku: "LAN-1", name: "Lanyard", basePrice: 25, gstRate: 18, hsn: "6307" }]

describe("rfqToQuotationLines", () => {
  it("prices a catalogue product from the catalogue, never the payload", () => {
    const [line] = rfqToQuotationLines([{ productId: "p1", name: "Lanyard", quantity: 500, rate: 0.01, gstRate: 0 }], products)
    expect(line.rate).toBe(25)
    expect(line.gstRate).toBe(18)
    expect(line.hsn).toBe("6307")
  })

  it("matches by SKU when the id is unknown", () => {
    const [line] = rfqToQuotationLines([{ productId: "x", sku: "LAN-1", quantity: 10, rate: 1 }], products)
    expect(line.rate).toBe(25)
  })

  it("keeps the submitted rate only for an item with no catalogue match", () => {
    const [line] = rfqToQuotationLines([{ name: "Custom badge", quantity: 100, rate: 12 }], products)
    expect(line.rate).toBe(12)
    expect(line.gstRate).toBe(18)
  })
})
