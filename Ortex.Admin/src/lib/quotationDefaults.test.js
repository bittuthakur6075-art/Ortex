// Mirrors Ortex.Mobile/test/quotationDefaults.test.mjs, plus the console-only
// helpers that decide where the defaults are stored.
import { describe, expect, it } from "vitest"
import { NO_DEFAULTS, columnIsLive, hasDefaults, isMissingColumnError, normaliseDefault, parseDefaults, withDefaults } from "./quotationDefaults"

const COMPANY_TERMS = "1. Prices are subject to final artwork approval.\n2. Taxes as applicable."
const base = { paymentTerms: "", terms: COMPANY_TERMS, notes: "", customer: { name: "" }, lines: [] }

describe("quotation defaults", () => {
  it("unset defaults leave the company draft untouched", () => {
    expect(withDefaults(base, NO_DEFAULTS)).toEqual(base)
    expect(hasDefaults(NO_DEFAULTS)).toBe(false)
  })

  it("set defaults replace the company values, including an intentional blank", () => {
    const d = { paymentTerms: "50% advance", terms: "", notes: "Proof within 24 hours" }
    const out = withDefaults(base, d)
    expect(out.paymentTerms).toBe("50% advance")
    expect(out.terms).toBe("")
    expect(out.notes).toBe("Proof within 24 hours")
    expect(hasDefaults(d)).toBe(true)
    expect(out.customer).toBe(base.customer)
  })

  it("typing the company text back stores null, so the person stays linked to the company", () => {
    expect(normaliseDefault(COMPANY_TERMS, COMPANY_TERMS)).toBeNull()
    expect(normaliseDefault(`${COMPANY_TERMS}\n\n`, COMPANY_TERMS)).toBeNull()
    expect(normaliseDefault("My own terms", COMPANY_TERMS)).toBe("My own terms")
    expect(normaliseDefault("", "")).toBeNull()
    expect(normaliseDefault("Net 30  ", "")).toBe("Net 30")
  })

  it("parses any stored shape and detects whether migration 0027 is live", () => {
    expect(parseDefaults(null)).toEqual(NO_DEFAULTS)
    expect(parseDefaults({ terms: "x", notes: 5 })).toEqual({ paymentTerms: null, terms: "x", notes: null })
    expect(columnIsLive({ id: "u", quotation_defaults: {} })).toBe(true)
    expect(columnIsLive({ id: "u" })).toBe(false)
    expect(columnIsLive(null)).toBe(false)
  })

  it("tells a missing column apart from a real failure", () => {
    expect(isMissingColumnError("Could not find the 'quotation_defaults' column of 'profiles' in the schema cache")).toBe(true)
    expect(isMissingColumnError('column "quotation_defaults" of relation "profiles" does not exist')).toBe(true)
    expect(isMissingColumnError('new row for relation "profiles" violates check constraint "profiles_quotation_defaults_shape"')).toBe(false)
    expect(isMissingColumnError("Failed to fetch")).toBe(false)
  })
})
