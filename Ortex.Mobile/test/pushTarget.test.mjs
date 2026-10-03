// Where a tapped notification goes, and which server pushes a phone mutes
// (src/domain/pushTarget.ts). The server payloads here are the ones Admin
// supabase/functions/push-notify sends; a change there must keep these passing.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { pushRoute, mutedPushCategories } = await loadTs("domain/pushTarget.ts")
const { DEFAULT_PREFS } = await loadTs("domain/notifications.ts")

const server = (targetScreen, targetId, kind) => ({ id: "x", targetScreen, targetId, phone: "", title: "t", remote: "1", kind })

test("server pushes open the right screen", () => {
  assert.deepEqual(pushRoute(server("EnquiryDetail", "e1", "lead")), { screen: "EnquiryDetail", params: { id: "e1" } })
  assert.deepEqual(pushRoute(server("VoiceCallDetail", "v1", "lead")), { screen: "VoiceCallDetail", params: { id: "v1" } })
  assert.deepEqual(pushRoute(server("ChatThread", "c1", "chat")), { screen: "ChatThread", params: { id: "c1" } })
  assert.deepEqual(pushRoute(server("AttendanceApprovals", "r1", "requests")), { screen: "AttendanceApprovals" })
  assert.deepEqual(pushRoute(server("LeaveRequest", "l1", "requests")), { screen: "LeaveRequest", params: { id: "l1" } })
  assert.deepEqual(pushRoute(server("AttendanceDay", "2026-09-30", "requests")), { screen: "AttendanceDay", params: { day: "2026-09-30" } })
  assert.deepEqual(pushRoute(server("Payslip", "p1", "pay")), { screen: "Payslip", params: { id: "p1" } })
  assert.deepEqual(pushRoute(server("PayClaims", "k1", "pay")), { screen: "Pay" })
})

test("the app's own lead alerts and scheduled notes", () => {
  assert.deepEqual(pushRoute({ id: "enq-new-1", target: { screen: "QuotationDetail", id: "q1" } }), { screen: "QuotationDetail", params: { id: "q1" } })
  assert.deepEqual(pushRoute({ daily: true, screen: "Attendance" }), { screen: "Attendance" })
  assert.equal(pushRoute({ daily: true }), null)
  assert.deepEqual(pushRoute({ id: "ortex.test", target: { screen: "EnquiryDetail", id: "ortex.test" } }), { screen: "Notifications" })
})

test("unknown screens, missing ids and bad days go nowhere", () => {
  assert.equal(pushRoute(null), null)
  assert.equal(pushRoute({}), null)
  assert.equal(pushRoute(server("Tabs", "x")), null)
  assert.equal(pushRoute(server("EnquiryDetail", "")), null)
  assert.equal(pushRoute(server("AttendanceDay", "r1")), null)
})

test("muted categories follow the prefs", () => {
  assert.deepEqual(mutedPushCategories(DEFAULT_PREFS), [])
  assert.deepEqual(mutedPushCategories({ ...DEFAULT_PREFS, enabled: false }), ["all"])
  assert.deepEqual(mutedPushCategories({ ...DEFAULT_PREFS, chat: false, pay: false, stale: false }), ["chat", "pay"])
})
