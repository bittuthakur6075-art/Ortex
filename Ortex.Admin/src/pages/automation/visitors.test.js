import { describe, it, expect } from "vitest"
import { buildVisitors, visitsOf, stepLabel, deviceLabel, sourceOf, headline, periodStart, placeOf } from "./visitors"

const at = (min) => new Date(Date.UTC(2026, 8, 18, 10, 0) + min * 60000).toISOString()
const row = (id, min, activityType, extra = {}) => ({
  id: `${id}-${min}-${activityType}`,
  userId: id,
  sessionId: `sess_${min}`,
  activityType,
  timestamp: at(min),
  device: "Mobile",
  operatingSystem: "Android",
  browser: "Chrome",
  referrer: "Direct",
  metadata: {},
  ...extra,
})

describe("visitsOf", () => {
  it("joins tabs opened together into one visit and folds repeats", () => {
    const visits = visitsOf([
      row("a", 0, "Home page visit"),
      row("a", 0, "Home page visit"),
      row("a", 1, "Home page visit"),
      row("a", 3, "Catalog view"),
    ])
    expect(visits).toHaveLength(1)
    expect(visits[0].steps.map((s) => [s.label, s.count])).toEqual([
      ["Opened the home page", 3],
      ["Browsed the product catalogue", 1],
    ])
    expect(visits[0].duration).toBe(3 * 60000)
  })

  it("starts a new visit after 30 minutes of silence, newest first", () => {
    const visits = visitsOf([row("a", 0, "Home page visit"), row("a", 45, "Catalog view")])
    expect(visits).toHaveLength(2)
    expect(visits[0].steps[0].label).toBe("Browsed the product catalogue")
  })
})

describe("labels", () => {
  it("reads product and category pages from the tracker's page field", () => {
    expect(stepLabel(row("a", 0, "Product page visit", { metadata: { page: "Product: acrylic-desk-standee" } }))).toBe("Viewed Acrylic desk standee")
    expect(stepLabel(row("a", 0, "Catalog view", { metadata: { page: "Category: mdf-products" } }))).toBe("Browsed Mdf products")
    expect(stepLabel(row("a", 0, "Product search", { metadata: { searchQuery: "lanyard" } }))).toBe('Searched for "lanyard"')
  })

  it("names devices in plain words", () => {
    expect(deviceLabel({ device: "Mobile", operatingSystem: "Android" })).toBe("Android phone")
    expect(deviceLabel({ device: "Mobile", operatingSystem: "iOS" })).toBe("iPhone")
    expect(deviceLabel({ device: "Desktop", operatingSystem: "Windows" })).toBe("Windows computer")
  })

  it("names sources", () => {
    expect(sourceOf("https://www.google.co.in/")).toBe("Google")
    expect(sourceOf("Direct")).toBe("Direct")
    expect(sourceOf("")).toBe("Direct")
    expect(sourceOf("https://l.instagram.com/?u=x")).toBe("Instagram")
  })

  it("treats a refused location as no place", () => {
    expect(placeOf({ location: "Not collected", city: "Not collected" })).toBe("")
    expect(placeOf({ location: "Rudarpur, Uttar Pradesh, India" })).toBe("Rudarpur")
  })
})

describe("buildVisitors", () => {
  it("groups by device, joins the enquiry and ranks interest", () => {
    const acts = [
      row("usr_a", 0, "Home page visit", { location: "Rudarpur, Uttar Pradesh, India" }),
      row("usr_a", 2, "Product page visit", { metadata: { productName: "MDF trophy" } }),
      row("usr_b", 5, "Home page visit", { device: "Desktop", operatingSystem: "Windows", location: "Not collected" }),
      row("usr_c", 1, "Quote builder visit"),
    ]
    const enquiries = [{ id: "e1", tracking: { userId: "usr_a" }, customer: { name: "Priya Sharma" }, productInterest: "MDF trophy", submittedAt: at(3) }]
    const [b, a, c] = buildVisitors(acts, enquiries)

    expect(b.id).toBe("usr_b")
    expect(b.name).toBe("Windows computer")
    expect(b.interest).toBe("browsing")

    expect(a.name).toBe("Priya Sharma")
    expect(a.interest).toBe("enquired")
    expect(a.lead.id).toBe("e1")
    expect(headline(a)).toBe("Sent an enquiry for MDF trophy")

    expect(c.interest).toBe("hot")
    expect(c.name).toBe("Android phone")
  })

  it("names an anonymous visitor by device and town", () => {
    const [v] = buildVisitors([row("usr_a", 0, "Catalog view", { city: "New Delhi" })])
    expect(v.name).toBe("Android phone in New Delhi")
    expect(v.interest).toBe("interested")
  })
})

describe("periodStart", () => {
  it("counts today from local midnight", () => {
    const now = new Date(2026, 8, 18, 15, 30).getTime()
    expect(periodStart("1", now)).toBe(new Date(2026, 8, 18).getTime())
    expect(periodStart("7", now)).toBe(new Date(2026, 8, 12).getTime())
    expect(periodStart("all", now)).toBe(0)
  })
})
