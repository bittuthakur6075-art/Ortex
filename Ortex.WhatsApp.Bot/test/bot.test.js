import { test } from "node:test"
import assert from "node:assert/strict"
import { sampleData } from "./fixture.js"
import { dailyDigest, periodReport, dueReport, leadsReport, quotesReport, websiteReport, money, change } from "../src/reports.js"
import { detectAlerts, bundle, remember, CALL_SETTLE_MS } from "../src/alerts.js"
import { dueDigests, alertsHeld } from "../src/schedule.js"
import { parseCommand, runCommand, runTool, askModel, tidy } from "../src/ask.js"
import { BOT_MARK } from "../src/whatsapp.js"
import { inQuietHours } from "../src/time.js"

const TZ = "Asia/Kolkata"
const HOUR = 3600000
// 18 Sept 2026, 10:00 IST (a Friday).
const NOW = Date.UTC(2026, 8, 18, 4, 30)
const data = sampleData(NOW)

test("money is compact and Indian", () => {
  assert.equal(money(125000), "₹1.25L")
  assert.equal(money(48000), "₹48K")
  assert.equal(money(0), "₹0")
})

test("change reads in words", () => {
  assert.equal(change({ pct: 12, diff: 5, dir: "up" }), "↑ 12% vs last week")
  assert.equal(change({ pct: null, diff: 3, dir: "up" }), "new vs last week")
  assert.equal(change({ pct: 0, diff: 0, dir: "flat" }), "same as last week")
})

test("daily digest counts the last 24 hours with the console's rules", () => {
  const text = dailyDigest(data, NOW, TZ)
  assert.match(text, /New leads: \*2\* \(1 website enquiry, 1 Anu call\)/)
  assert.match(text, /Quotations won: \*1\* worth ₹40K/)
  assert.match(text, /Payments received: \*₹20K\*/)
  // INV-0012 is 12 days late: the Dashboard's "Overdue", first in the list.
  assert.match(text, /1\. 🔴 \*Overdue\*: Acme Corp · ₹48K/)
  assert.match(text, /₹68K to collect, of which \*₹48K\* is overdue/)
  assert.doesNotMatch(text, /[—]/, "no em dashes")
})

test("period report and the command reports render", () => {
  assert.match(periodReport(data, NOW, TZ, "7d"), /Ortex report, last 7 days/)
  assert.match(periodReport(data, NOW, TZ, "30d"), /last 30 days/)
  assert.match(dueReport(data, NOW), /Outstanding \*₹68K\*/)
  assert.match(leadsReport(data, NOW), /Anil Kumar/)
  assert.match(quotesReport(data, NOW), /Mehta & Co/)
  assert.match(websiteReport(data, NOW, 7), /Visitors: \*3\*/)
})

test("every bot message carries the self-mark", () => {
  for (const text of [dailyDigest(data, NOW, TZ), periodReport(data, NOW, TZ), runCommand("help", data, NOW, TZ), runCommand("website", data, NOW, TZ), runCommand("needs", data, NOW, TZ)]) {
    assert.ok(BOT_MARK.test(text), text.slice(0, 40))
  }
})

test("alerts: only what is new since alerts were switched on, once", () => {
  const state = { since: new Date(NOW - 4 * HOUR).toISOString(), alerted: [] }
  const { alerts, keys } = detectAlerts(data, state, NOW)
  // e1 (3h ago), the Anu call (2h ago, settled), q2 won (5h ago is before `since`: no), p1 (2h ago)
  assert.equal(alerts.length, 3)
  assert.match(alerts[0], /New quote request/)
  assert.match(alerts[0], /\*Priya Sharma\* · 98765 43210/)
  assert.match(alerts[1], /Anu took a call/)
  assert.match(alerts[2], /Payment received\*\n\*₹20K\* from Bright Events/)
  assert.ok(alerts.every((a) => BOT_MARK.test(a)))

  const again = detectAlerts(data, remember(state, keys), NOW)
  assert.equal(again.alerts.length, 0, "never repeated")
})

test("alerts: a call still in progress waits until it goes quiet", () => {
  const justNow = sampleData(NOW)
  justNow.enquiries.find((e) => e.id === "v1").createdAt = new Date(NOW - CALL_SETTLE_MS / 2).toISOString()
  const state = { since: new Date(NOW - HOUR).toISOString() }
  assert.ok(!detectAlerts(justNow, state, NOW).alerts.some((a) => /Anu/.test(a)))
  assert.ok(detectAlerts(justNow, state, NOW + CALL_SETTLE_MS).alerts.some((a) => /Anu/.test(a)))
})

test("alerts can be switched off one by one", () => {
  const state = { since: new Date(NOW - 4 * HOUR).toISOString() }
  const { alerts } = detectAlerts(data, state, NOW, { newEnquiry: false, voiceCall: false })
  assert.equal(alerts.length, 1)
  assert.match(alerts[0], /Payment/)
})

test("held alerts arrive as one message", () => {
  assert.equal(bundle(["🔔 a"]), "🔔 a")
  assert.match(bundle(["🔔 a", "💰 b"]), /^🌅 \*While you were away\* \(2\)/)
})

test("digests are due once a day, after their time, never in quiet hours", () => {
  const cfg = { timezone: TZ, digest: { daily: "09:00", weekly: { day: "Friday", time: "09:00" } }, alerts: { quietHours: { from: "21:00", to: "08:00" } } }
  assert.deepEqual(dueDigests(NOW, cfg, {}), ["daily", "weekly"]) // Fri 10:00 IST
  assert.deepEqual(dueDigests(NOW, cfg, { lastDaily: "2026-09-18", lastWeekly: "2026-09-18" }), [])
  const early = Date.UTC(2026, 8, 18, 2, 0) // 07:30 IST: before 9 and in quiet hours
  assert.deepEqual(dueDigests(early, cfg, {}), [])
  const late = Date.UTC(2026, 8, 18, 17, 0) // 22:30 IST: quiet hours
  assert.deepEqual(dueDigests(late, cfg, {}), [])
})

test("quiet hours wrap past midnight; mute holds alerts", () => {
  const quiet = { from: "21:00", to: "08:00" }
  assert.equal(inQuietHours("22:15", quiet), true)
  assert.equal(inQuietHours("07:59", quiet), true)
  assert.equal(inQuietHours("08:00", quiet), false)
  const cfg = { timezone: TZ, alerts: { quietHours: quiet } }
  assert.equal(alertsHeld(NOW, cfg, {}), null)
  assert.equal(alertsHeld(NOW, cfg, { mutedUntil: new Date(NOW + HOUR).toISOString() }), "muted")
})

test("commands understand what people type", () => {
  assert.equal(parseCommand("Today"), "today")
  assert.equal(parseCommand("/due"), "due")
  assert.equal(parseCommand("aaj ka"), "today")
  assert.equal(parseCommand("weekly!"), "week")
  assert.equal(parseCommand("who owes us money?"), null)
})

test("tools find records the way the console matches them", () => {
  const [c] = runTool("find_customers", { query: "sharma" }, data, NOW, TZ)
  assert.equal(c.name, "Priya Sharma, Sharma Traders")
  assert.equal(c.quotations, 1, "QT-0101 matches by company")
  const unpaid = runTool("find_invoices", { status: "overdue" }, data, NOW, TZ)
  assert.deepEqual(unpaid.map((i) => i.number), ["INV-0012"])
  assert.equal(unpaid[0].balanceDue, "₹48K")
  const anu = runTool("find_enquiries", { source: "anu" }, data, NOW, TZ)
  assert.deepEqual(anu.map((e) => e.name), ["Anil Kumar"])
})

test("the model answers from a tool result, and long dashes are removed", async () => {
  const calls = []
  const replies = [
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "find_invoices", args: { query: "acme" } } }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "Acme Corp owes *₹48K* — 12 days late." }] } }] },
  ]
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body))
    return { ok: true, json: async () => replies[calls.length - 1] }
  }
  const answer = await askModel({ question: "Did Acme pay?", data, now: NOW, tz: TZ, apiKey: "k", model: "m", fetchImpl })
  assert.equal(answer, "Acme Corp owes *₹48K*, 12 days late.")
  const toolTurn = calls[1].contents.at(-1).parts[0].functionResponse
  assert.equal(toolTurn.name, "find_invoices")
  assert.equal(toolTurn.response.result[0].number, "INV-0012")
  assert.equal(tidy("a – b"), "a, b")
})
