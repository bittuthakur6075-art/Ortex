import { describe, expect, it } from "vitest"
import { effectivePrefix, longestInvoiceNumber, prefixProblems } from "./numbering"
import { documentNumber } from "./id"

const ortex = { name: "Ortex Industries", numbering: { quotationPrefix: "QTN", invoicePrefix: "INV", paymentPrefix: "PAY" } }

describe("document number prefixes", () => {
  it("a blank prefix falls back to the default", () => {
    expect(effectivePrefix({ invoicePrefix: "  " }, "invoicePrefix")).toBe("INV")
    expect(effectivePrefix({ invoicePrefix: "amn" }, "invoicePrefix")).toBe("AMN")
  })

  it("the longest invoice number matches documentNumber", () => {
    expect(longestInvoiceNumber("AMN")).toBe(documentNumber("AMN", 99999, new Date("2026-10-24")).length)
  })

  it("accepts the chosen prefixes for the other companies", () => {
    for (const p of [["AMNQ", "AMN", "AMNP"], ["MDXQ", "MDX", "MDXP"], ["NDHQ", "NDH", "NDHP"]]) {
      const numbering = { quotationPrefix: p[0], invoicePrefix: p[1], paymentPrefix: p[2] }
      expect(prefixProblems(numbering, [ortex])).toEqual([])
    }
  })

  it("refuses a prefix another company uses, in any series", () => {
    const p = prefixProblems({ quotationPrefix: "AMNQ", invoicePrefix: "PAY", paymentPrefix: "AMNP" }, [ortex])
    expect(p).toEqual(["Invoice prefix PAY is already used by Ortex Industries. Choose another."])
  })

  it("a company with no numbering block uses the defaults, so it clashes with Ortex", () => {
    expect(prefixProblems({}, [ortex])).toHaveLength(3)
  })

  it("refuses bad characters, a too-long invoice prefix and a repeat within the company", () => {
    const p = prefixProblems({ quotationPrefix: "A B", invoicePrefix: "ABCDEF", paymentPrefix: "A B" }, [])
    expect(p.some((x) => x.startsWith("Quotation prefix: use only"))).toBe(true)
    expect(p.some((x) => x.startsWith("Invoice prefix: at most 5 characters"))).toBe(true)
    expect(p.some((x) => x.includes("are both A B"))).toBe(true)
  })
})
