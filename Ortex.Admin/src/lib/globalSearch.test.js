import { describe, expect, it } from "vitest"
import { buildSearchIndex, phoneDigits, searchIndex } from "./globalSearch"
import { VOICE_SOURCE } from "../pages/voice-leads/helpers"

const at = (min) => new Date(Date.UTC(2026, 8, 12, 10, min)).toISOString()

const data = {
  customers: [
    { id: "c1", name: "Ravi Kumar", company: "Sunrise Schools", phone: "+91 98765 43210", email: "ravi@sunrise.in" },
    { id: "c2", name: "Meena", company: "", phone: "9123456789" },
  ],
  enquiries: [
    { id: "e1", source: "Website", customer: { name: "Asha Rao", phone: "9000011111" }, productInterest: "Acrylic trophies", status: "new", createdAt: at(0) },
    // Two captures of one Anu call, the older one mentioning a product the final order dropped.
    { id: "v1", source: VOICE_SOURCE, customer: { name: "Kiran", phone: "9555512345" }, items: [{ product: "Lanyards", quantity: "500" }], message: "Wants lanyards", status: "new", createdAt: at(1) },
    { id: "v2", source: VOICE_SOURCE, customer: { name: "Kiran", phone: "09555512345" }, items: [{ product: "Lanyards", quantity: "500" }, { product: "ID card holders", quantity: "" }], message: "Lanyards and holders", status: "new", createdAt: at(3) },
  ],
  quotations: [{ id: "q1", number: "QTN-2026-0042", customer: { company: "Sunrise Schools", phone: "9876543210" }, status: "sent" }],
  invoices: [{ id: "i1", number: "INV-2026-0007", customer: { name: "Meena" }, status: "paid" }],
  products: [
    { id: "p1", name: "MDF Key Holder", sku: "MDF-KH-01", hsn: "4421", category: "MDF products", status: "active" },
    { id: "p2", name: "Acrylic Keychain", sku: "ACR-KC", category: "Acrylic", status: "draft" },
    { id: "p3", name: "Old Keychain", sku: "OLD-KC", status: "archived" },
  ],
}

const all = buildSearchIndex(data)
const kinds = (groups) => groups.map((g) => g.kind)
const group = (groups, kind) => groups.find((g) => g.kind === kind)?.items || []

describe("globalSearch", () => {
  it("normalises phone numbers", () => {
    expect(phoneDigits("+91 98765 43210")).toBe("9876543210")
    expect(phoneDigits("09876543210")).toBe("9876543210")
  })

  it("needs two characters", () => {
    expect(searchIndex(all, "r")).toEqual([])
  })

  it("matches phone digits ignoring +91 and spaces", () => {
    const g = searchIndex(all, "+91 98765")
    expect(group(g, "customer").map((h) => h.to)).toEqual(["/customers/c1"])
    expect(group(g, "quotation")[0].state).toEqual({ openId: "q1" })
  })

  it("keeps web enquiries and Anu calls apart, folding a call's captures into one hit", () => {
    const g = searchIndex(all, "kiran")
    expect(kinds(g)).toEqual(["voice"])
    expect(group(g, "voice")).toHaveLength(1)
    expect(group(g, "voice")[0]).toMatchObject({ to: "/crm?tab=voice", state: { openId: "v2" } })

    const w = searchIndex(all, "trophies")
    expect(group(w, "enquiry")[0].to).toBe("/enquiries/e1")
    expect(group(w, "voice")).toEqual([])
  })

  it("finds a call by the items Anu captured", () => {
    expect(group(searchIndex(all, "card holders"), "voice")).toHaveLength(1)
  })

  it("searches active and draft products by name, SKU and HSN, never archived", () => {
    expect(group(searchIndex(all, "keychain"), "product").map((h) => h.state.openId)).toEqual(["p2"])
    expect(group(searchIndex(all, "mdf-kh"), "product")[0]).toMatchObject({ to: "/catalog?tab=products", meta: "MDF-KH-01 · MDF products" })
    expect(group(searchIndex(all, "4421"), "product")).toHaveLength(1)
  })

  it("opens invoices and quotations by number", () => {
    expect(group(searchIndex(all, "inv-2026"), "invoice")[0]).toMatchObject({ to: "/billing?tab=invoices", state: { openId: "i1" } })
  })

  it("drops groups the profile cannot open", () => {
    const limited = buildSearchIndex(data, (key) => key === "quotations")
    expect(kinds(searchIndex(limited, "sunrise"))).toEqual(["quotation"])
  })

  it("caps each group", () => {
    const many = buildSearchIndex({ customers: Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `Test ${i}` })) })
    expect(group(searchIndex(many, "test"), "customer")).toHaveLength(5)
  })
})
