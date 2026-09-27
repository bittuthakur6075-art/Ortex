import { describe, it, expect } from "vitest"
import { buildLead, channelOf } from "./model"

// One lead per writer, shaped exactly as that writer stores it, so a field that
// lives somewhere unexpected (Anu's quantity in the message, IndiaMART's state
// as a name) cannot silently show "not given" on the list again.
const now = new Date("2026-09-27T11:00:00+05:30").getTime()
const products = [{ id: "p1", sku: "LAN-20", name: "Polyester lanyard", basePrice: 24, hsn: "6307", gstRate: 18 }]
const build = (e) => buildLead({ status: "new", createdAt: "2026-09-26T10:00:00Z", ...e }, { products, quotations: [], now })

describe("buildLead maps every source", () => {
  it("website contact form", () => {
    const l = build({ source: "Website contact form", customer: { name: "Priya", phone: "9845022117", company: "Infosys", email: "p@x.in" }, productInterest: "Lanyards", message: "Need 500 for an event" })
    expect(channelOf(l.e)).toBe("website")
    expect(l.asked).toBe("Lanyards")
    expect(l.summary).toBe("Need 500 for an event")
    expect(l.askedSub).toBe("Qty not given")
  })

  it("website quote calculator (RFQ in notes)", () => {
    const l = build({ source: "Quote calculator", customer: { name: "Priya", phone: "9845022117" }, notes: JSON.stringify({ items: [{ productId: "p1", name: "Polyester lanyard", quantity: 1000 }] }) })
    expect(l.asked).toBe("Polyester lanyard")
    expect(l.askedSub).toBe("Qty 1,000 · 1 line")
    expect(l.value).toBe(24000)
    expect(l.askedItems).toEqual([{ product: "Polyester lanyard", quantity: "1000", unit: "pcs" }])
  })

  it("Anu call with one item: quantity from the message, city from the address", () => {
    const l = build({ source: "Voice assistant (Anu)", customer: { name: "Rahul", phone: "9820144120", address: "Andheri East, Mumbai" }, productInterest: "Leather diaries", message: "Wants A5 diaries · Qty: 1000 · Timeline: by 10 Oct" })
    expect(l.qtyText).toBe("1000")
    expect(l.askedSub).toBe("Qty 1,000")
    expect(l.location).toBe("Mumbai")
    expect(l.summary).toBe("Wants A5 diaries")
    expect(l.timeline).toBe("by 10 Oct")
  })

  it("Anu call with several items", () => {
    const l = build({ source: "Voice assistant (Anu)", customer: { name: "Rahul", phone: "9820144120" }, productInterest: "Lanyards, ID holders", items: [{ product: "Lanyards", quantity: "1000" }, { product: "ID holders", quantity: "500" }], message: "Items: 1000 x Lanyards; 500 x ID holders" })
    expect(l.askedItems.map((i) => i.product)).toEqual(["Lanyards", "ID holders"])
    expect(l.asked).toBe("Lanyards +1 more")
    expect(l.askedSub).toBe("Qty 1,500 · 2 items")
  })

  it("IndiaMART: city and state name", () => {
    const l = build({ source: "IndiaMART", customer: { name: "Imran", phone: "9811112222", city: "Nagpur", state: "Maharashtra" }, productInterest: "Acrylic keychains", message: "Need price" })
    expect(channelOf(l.e)).toBe("indiamart")
    expect(l.location).toBe("Nagpur, Maharashtra")
    expect(l.asked).toBe("Acrylic keychains")
  })

  it("Excel import: quantity, rate and city fields", () => {
    const l = build({ source: "Phone", imported: { file: "x.xlsx", row: 2 }, customer: { name: "Sneha", phone: "9876543210", city: "Pune" }, productInterest: "MDF trophies", quantity: "200", rate: "110" })
    expect(channelOf(l.e)).toBe("import")
    expect(l.askedSub).toBe("Qty 200 · ₹110/pc")
    expect(l.value).toBe(22000)
    expect(l.location).toBe("Pune")
  })

  it("a manual lead with nothing filled in yet", () => {
    const l = build({ source: "Phone", customer: { name: "", phone: "" } })
    expect(l.name).toBe("")
    expect(l.asked).toBe("Not given")
    expect(l.askedItems).toEqual([])
    expect(l.location).toBe("")
  })
})
