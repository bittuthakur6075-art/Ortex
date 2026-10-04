import { describe, expect, it } from "vitest"
import { COMPANY_MARK_COLOURS, companyColour, companyInitials, companyMarkSvg, isMedinetix, isAman } from "./companyMark"

// Pinned to the phone's Ortex.Mobile/src/domain/companyMark.ts: same inputs, same mark.
describe("companyMark", () => {
  it("takes the first letters of two words", () => {
    expect(companyInitials("Aman Enterprise")).toBe("AE")
    expect(companyInitials("Nidhi Industries")).toBe("NI")
    expect(companyInitials("  ortex  ")).toBe("O")
    expect(companyInitials("")).toBe("")
  })
  it("colours a company by its id, stably", () => {
    expect(companyColour("aman")).toBe("#0F766E")
    expect(companyColour("aman")).toBe(companyColour("aman"))
    expect(COMPANY_MARK_COLOURS).toContain(companyColour("nidhi"))
  })
  it("draws a 64px square with the initials", () => {
    const svg = companyMarkSvg("aman", "Aman <Enterprise>")
    expect(svg).toContain('fill="#0F766E"')
    expect(svg).toContain('font-size="26"')
    expect(svg).toContain(">A&lt;</text>")
    expect(companyMarkSvg("x", "")).toContain(">?</text>")
  })
  it("identifies Medinetix by id or name", () => {
    expect(isMedinetix("medinetix", "")).toBe(true)
    expect(isMedinetix("c1", "Medinetix Enterprises")).toBe(true)
    expect(isMedinetix("ortex", "Ortex Industries")).toBe(false)
  })
  it("identifies Aman by id or name", () => {
    expect(isAman("aman", "")).toBe(true)
    expect(isAman("c2", "Aman Enterprise")).toBe(true)
    expect(isAman("c3", "Aman Enterprises")).toBe(true)
    expect(isAman("ortex", "Ortex Industries")).toBe(false)
  })
})

