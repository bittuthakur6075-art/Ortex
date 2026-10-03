import { describe, expect, it } from "vitest"
import { addressFromLegacy, dispatchBlock, formatAddress, formatAddressOneLine, isValidPincode, registeredLines } from "./address"

const REG = { line1: "B-12, Okhla Phase 2", line2: "", city: "New Delhi", stateCode: "07", pincode: "110020" }

describe("address", () => {
  it("formats lines, skipping empties, with the GST state's name", () => {
    expect(formatAddress(REG)).toEqual(["B-12, Okhla Phase 2", "New Delhi - 110020", "Delhi"])
    expect(formatAddress({ city: "Pune" })).toEqual(["Pune"])
    expect(formatAddress({ pincode: "411001", stateCode: "27" })).toEqual(["411001", "Maharashtra"])
    expect(formatAddress(null)).toEqual([])
    expect(formatAddressOneLine(REG)).toBe("B-12, Okhla Phase 2, New Delhi - 110020, Delhi")
  })

  it("checks a PIN code: six digits, not starting with 0", () => {
    expect(isValidPincode("110020")).toBe(true)
    expect(isValidPincode(" 560001 ")).toBe(true)
    expect(isValidPincode("011002")).toBe(false)
    expect(isValidPincode("11002")).toBe(false)
    expect(isValidPincode("1100201")).toBe(false)
    expect(isValidPincode("11002a")).toBe(false)
    expect(isValidPincode("")).toBe(false)
  })

  it("puts an old address in line 1 for the owner to split", () => {
    expect(addressFromLegacy("Plot 4\nNew Delhi, India")).toEqual({ line1: "Plot 4, New Delhi, India", line2: "", city: "", stateCode: "", pincode: "" })
    expect(addressFromLegacy(undefined).line1).toBe("")
  })

  it("documents print the registered address, else the old string as it was", () => {
    expect(registeredLines({ address: "New Delhi, India", registeredAddress: REG })).toEqual(formatAddress(REG))
    expect(registeredLines({ address: "Plot 4\n New Delhi " })).toEqual(["Plot 4", "New Delhi"])
    expect(registeredLines({ address: "Old", registeredAddress: { line1: " " } })).toEqual(["Old"])
    // The state defaults to the company's, then its GSTIN's.
    expect(registeredLines({ stateCode: "29", registeredAddress: { line1: "x" } })).toEqual(["x", "Karnataka"])
    expect(registeredLines({ gstin: "27ABCDE1234F1Z5", registeredAddress: { line1: "x" } })).toEqual(["x", "Maharashtra"])
    expect(registeredLines(null)).toEqual([])
  })

  it("a dispatch block only when it has an address, titled by its label", () => {
    expect(dispatchBlock({ dispatchAddress: null })).toBe(null)
    expect(dispatchBlock({ dispatchAddress: { label: "Branch / dispatch" } })).toBe(null)
    expect(dispatchBlock({ stateCode: "07", dispatchAddress: { city: "Noida", stateCode: "09" } })).toEqual({ label: "Branch / dispatch", title: "Dispatch from", lines: ["Noida", "Uttar Pradesh"] })
    expect(dispatchBlock({ stateCode: "07", dispatchAddress: { label: "Okhla works", line1: "Shed 3" } }).title).toBe("Dispatch from: Okhla works")
  })
})
