import { describe, expect, it } from "vitest"
import { canSeeAllCompanies, companiesOf, companyForCreate, companyScope, companySlug, hasCompany, inCompanies, pickCompany } from "./roles"
import { settingsFor, DEFAULT_SETTINGS } from "../data/domain/settingsDefaults"

// Multi-company (0075/0076). Same names and rules as Ortex.Mobile/src/domain/modules.ts.
const table = [
  { id: "ortex", name: "Ortex Industries", active: true },
  { id: "aman", name: "Aman Enterprise", active: false },
  { id: "nidhi", name: "Nidhi Industries", active: true },
]
const owner = { id: "o", role: "super_admin" }
const admin = { id: "a", role: "admin", companies: ["nidhi", "ortex"] }
const sales = { id: "s", role: "sales", companies: ["ortex"] }

describe("companiesOf and hasCompany", () => {
  it("a Super Admin works in every active company, in table order", () => {
    expect(companiesOf(owner, table).map((c) => c.id)).toEqual(["ortex", "nidhi"])
    expect(hasCompany(owner, "aman")).toBe(true)
  })
  it("anyone else in their own list, their default first", () => {
    expect(companiesOf(admin, table).map((c) => c.id)).toEqual(["nidhi", "ortex"])
    expect(companiesOf(sales, table).map((c) => c.id)).toEqual(["ortex"])
    expect(hasCompany(sales, "nidhi")).toBe(false)
    expect(hasCompany({ ...sales, active: false }, "ortex")).toBe(false)
  })
  it("All companies only for admins with more than one", () => {
    expect(canSeeAllCompanies(admin, companiesOf(admin, table))).toBe(true)
    expect(canSeeAllCompanies(sales, companiesOf(sales, table))).toBe(false)
    expect(canSeeAllCompanies({ role: "accounts", companies: ["ortex", "nidhi"] }, table)).toBe(false)
  })
})

describe("the company in view", () => {
  const mine = companiesOf(admin, table)
  it("keeps a saved choice that still holds, else the default", () => {
    expect(pickCompany("all", admin, mine)).toBe("all")
    expect(pickCompany("ortex", admin, mine)).toBe("ortex")
    expect(pickCompany("aman", admin, mine)).toBe("nidhi")
    expect(pickCompany("all", sales, companiesOf(sales, table))).toBe("ortex")
    expect(pickCompany(null, sales, [])).toBe("")
  })
  it("filters rows by scope; no companies means no filter", () => {
    const rows = [{ id: 1, companyId: "ortex" }, { id: 2, companyId: "nidhi" }, { id: 3 }]
    expect(inCompanies(rows, companyScope("ortex", mine)).map((r) => r.id)).toEqual([1])
    expect(inCompanies(rows, companyScope("all", mine)).map((r) => r.id)).toEqual([1, 2])
    expect(inCompanies(rows, companyScope("", []))).toBe(rows)
  })
  it("a create needs one real company once companies exist", () => {
    expect(companyForCreate("nidhi", true)).toBe("nidhi")
    expect(() => companyForCreate("all", true)).toThrow("Choose a company")
    expect(() => companyForCreate("", true)).toThrow("Choose a company")
    expect(companyForCreate("", false)).toBeUndefined()
  })
  it("a new company gets a unique id", () => {
    expect(companySlug("Aman Enterprise", ["aman"])).toBe("aman-enterprise")
    expect(companySlug("Aman", ["aman", "aman-2"])).toBe("aman-3")
    expect(companySlug("2 Brothers & Co")).toBe("brothers-co")
    expect(companySlug("")).toMatch(/^[a-z][a-z0-9-]{1,31}$/)
  })
})

describe("settingsFor", () => {
  const global = { ...DEFAULT_SETTINGS, company: { ...DEFAULT_SETTINGS.company, name: "Ortex Industries", gstin: "07AAAAA0000A1Z5" }, tax: { defaultGstRate: 12, pricesIncludeTax: false } }
  it("takes the company block only from the company, never Ortex's", () => {
    const s = settingsFor(global, { company: { name: "Aman Enterprise" } })
    expect(s.company.name).toBe("Aman Enterprise")
    expect(s.company.gstin).toBe("")
    expect(s.tax.defaultGstRate).toBe(12)
    expect(s.notifications).toEqual(global.notifications)
  })
  it("uses the company's own blocks where it has them", () => {
    const s = settingsFor(global, { company: { name: "N" }, numbering: { invoicePrefix: "NI" }, tax: { defaultGstRate: 5 } })
    expect(s.numbering.invoicePrefix).toBe("NI")
    expect(s.numbering.quotationPrefix).toBe("QTN")
    expect(s.tax.defaultGstRate).toBe(5)
  })
  it("no company doc: the global settings as before", () => {
    expect(settingsFor(global, null).company.gstin).toBe("07AAAAA0000A1Z5")
  })
})

describe("create stamping (data/store/company.js)", async () => {
  const { companyState, companyIdForCreate, scopeRows } = await import("../data/store/company")
  it("stamps the current company, keeps a record's own, refuses All", () => {
    companyState.attach(admin, table)
    companyState.set("ortex")
    expect(companyIdForCreate("quotations", {})).toBe("ortex")
    expect(companyIdForCreate("quotations", { companyId: "nidhi" })).toBe("nidhi")
    expect(companyIdForCreate("products", {})).toBeUndefined()
    expect(scopeRows("payments", [{ companyId: "nidhi" }, { companyId: "ortex" }])).toEqual([{ companyId: "ortex" }])
    companyState.set("all")
    expect(() => companyIdForCreate("enquiries", {})).toThrow("Choose a company")
    expect(companyIdForCreate("enquiries", { companyId: "nidhi" })).toBe("nidhi")
  })
  it("before 0075 (no companies) nothing is stamped", () => {
    companyState.attach(sales, [])
    expect(companyIdForCreate("quotations", {})).toBeUndefined()
    expect(scopeRows("quotations", [{ id: 1 }])).toEqual([{ id: 1 }])
  })
})
