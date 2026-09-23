import { describe, expect, it } from "vitest"
import { daysOf, parseIntent, teamOf } from "./anuIntent"
import { briefingReply, quotationsReply, salesReply } from "./anuReply"

const intent = (t) => parseIntent(t)

describe("sending to a team", () => {
  it.each([
    ["Send to sales team: meeting at 5", "sales", "meeting at 5"],
    ["tell accounts that INV-7 is paid", "accounts", "INV-7 is paid"],
    ["announce to everyone office closed tomorrow", "everyone", "office closed tomorrow"],
    ["message the staff: lunch is ready", "staff", "lunch is ready"],
    ["sales team ko bolo meeting at 5", "sales", "meeting at 5"],
    ["accounts ko bata do ki payment aa gaya", "accounts", "payment aa gaya"],
    ["sabko meeting 4 baje bolo", "everyone", "meeting 4 baje"],
  ])("%s", (text, team, body) => {
    expect(intent(text)).toEqual({ intent: "send_team", team, body })
  })

  it("does not treat 'tell me' as a send", () => {
    expect(intent("tell me about new leads").intent).toBe("enquiries")
  })
})

describe("attendance and team updates", () => {
  it.each([
    ["Who is not in today?", null],
    ["who checked in", null],
    ["sales ki attendance", "sales"],
    ["kaun aaya aaj", null],
    ["who is on leave today", null],
    ["absent in accounts", "accounts"],
  ])("%s", (text, team) => {
    expect(intent(text)).toEqual({ intent: "attendance", team })
  })

  it("reads daily updates", () => {
    expect(intent("daily update")).toEqual({ intent: "team_update", team: null })
    expect(intent("accounts report")).toEqual({ intent: "team_update", team: "accounts" })
    expect(intent("update for sales team")).toEqual({ intent: "team_update", team: "sales" })
  })
})

describe("lookups", () => {
  it("finds a quotation by number", () => {
    expect(intent("show QT-2026-014")).toMatchObject({ intent: "quotation", query: "QT-2026-014" })
  })
  it("filters quotations by status and name", () => {
    expect(intent("sent quotations for sharma")).toEqual({ intent: "quotation", query: "sharma", status: "sent" })
  })
  it("reads leads with status and period", () => {
    expect(intent("new leads this week")).toEqual({ intent: "enquiries", query: "", status: "new", days: 7 })
    expect(intent("leads from mehta")).toMatchObject({ intent: "enquiries", query: "mehta" })
  })
  it("reads products and prices", () => {
    expect(intent("price of satin lanyard")).toEqual({ intent: "products", query: "satin lanyard" })
  })
  it("reads a customer by phone", () => {
    expect(intent("+91 98765 43210")).toEqual({ intent: "customers", query: "9876543210" })
    expect(intent("customer mehta")).toEqual({ intent: "customers", query: "mehta" })
  })
  it("reads the rest", () => {
    expect(intent("What needs my attention today?").intent).toBe("briefing")
    expect(intent("sales this month")).toEqual({ intent: "sales_summary", days: 30 })
    expect(intent("How do I record a payment?").intent).toBe("help")
    expect(intent("what's new")).toEqual({ intent: "whats_new" })
    expect(intent("hello")).toEqual({ intent: "greet" })
    expect(intent("thanks!")).toEqual({ intent: "thanks" })
    expect(intent("Bright Corp")).toEqual({ intent: "search", query: "bright corp" })
  })
})

describe("helpers", () => {
  it("names teams by their longest alias", () => {
    expect(teamOf("the sales team please")).toBe("sales")
    expect(teamOf("tell finance")).toBe("accounts")
    expect(teamOf("nothing here")).toBe(null)
  })
  it("reads periods", () => {
    expect(daysOf("last 45 days")).toBe(45)
    expect(daysOf("today")).toBe(1)
    expect(daysOf("this month")).toBe(30)
    expect(daysOf("ok")).toBe(null)
  })
})

describe("reply templates", () => {
  it("writes the briefing", () => {
    const text = briefingReply({
      new_enquiries: { count: 2, waiting_over_2_days: 1 },
      anu_calls_to_return: { count: 1, support_complaints: 1 },
      quotations: { expiring_within_3_days: [{ number: "QT-1", customer: "Bright", value: "₹1,000" }], already_expired_but_still_sent: [], waiting_a_week_or_more: [], open_pipeline_value: "₹5,000" },
    })
    expect(text).toContain("2 new website enquiries not contacted yet, 1 waiting over 2 days.")
    expect(text).toContain("1 Anu call to return, including 1 support complaint.")
    expect(text).toContain("QT-1 (Bright, ₹1,000)")
    expect(text).not.toMatch(/[—–]/)
  })
  it("writes quotations and sales", () => {
    expect(quotationsReply({ total: 0 }, { query: "x" })).toBe('No quotations for "x".')
    expect(salesReply({ period: "the last 30 days", quotations_sent: 3, quoted_value: "₹9", won: 1, won_value: "₹3", win_rate: "50%" }))
      .toContain("Won: 1, worth ₹3 (win rate 50%)")
    expect(salesReply({ ok: false, error: "nope" })).toBe("nope")
  })
})
