// Anu in Team chat: the phone and the console must understand a sentence the
// same way and answer it in the same words. Both are rule-based (no model), so
// this test runs each sample through BOTH ports and asserts they agree.
//   Ortex.Admin/src/lib/anuIntent.js, anuReply.js, chat.js  (source of truth)
//   Ortex.Mobile/src/domain/anuIntent.ts, anuReply.ts, chat.ts  (the ports)

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const adminIntent = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/anuIntent.js"))
const adminReply = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/anuReply.js"))
const adminChat = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/chat.js"))
const intent = await loadTs("domain/anuIntent.ts")
const reply = await loadTs("domain/anuReply.ts")
const chat = await loadTs("domain/chat.ts")

const SAMPLES = [
  "Send to sales team: meeting at 5",
  "tell accounts that INV-7 is paid",
  "announce to everyone office closed tomorrow",
  "sales team ko bolo meeting at 5",
  "sabko meeting 4 baje bolo",
  "tell me about new leads",
  "Who is not in today?",
  "sales ki attendance",
  "kaun aaya aaj",
  "daily update",
  "accounts report",
  "show QT-2026-014",
  "sent quotations for sharma",
  "new leads this week",
  "price of satin lanyard",
  "+91 98765 43210",
  "customer mehta",
  "What needs my attention today?",
  "sales this month",
  "How do I record a payment?",
  "what's new",
  "hello",
  "Bright Corp",
  "",
]

test("the phone parses every sample exactly as the console does", () => {
  for (const s of SAMPLES) assert.deepEqual(intent.parseIntent(s), adminIntent.parseIntent(s), s)
})

test("a few intents, stated plainly", () => {
  assert.deepEqual(intent.parseIntent("tell accounts that INV-7 is paid"), { intent: "send_team", team: "accounts", body: "INV-7 is paid" })
  assert.deepEqual(intent.parseIntent("Who is not in today?"), { intent: "attendance", team: null })
  assert.equal(intent.parseIntent("tell me about new leads").intent, "enquiries")
})

test("replies are written in the same words on both", () => {
  const b = {
    new_enquiries: { count: 2, waiting_over_2_days: 1 },
    anu_calls_to_return: { count: 1, support_complaints: 0 },
    quotations: { expiring_within_3_days: [{ number: "QT-1", customer: "Bright", value: "₹1,000" }], already_expired_but_still_sent: [], waiting_a_week_or_more: [{ number: "QT-2" }], open_pipeline_value: "₹5,000" },
  }
  assert.equal(reply.briefingReply(b), adminReply.briefingReply(b))
  const q = { total: 2, total_value: "₹9", results: [{ number: "QT-1", customer: "A", value: "₹4", status: "Sent", valid_until: "1 Oct 2026" }] }
  assert.equal(reply.quotationsReply(q, { query: "a" }), adminReply.quotationsReply(q, { query: "a" }))
  assert.equal(reply.greetReply("Priya"), adminReply.greetReply("Priya"))
  assert.equal(reply.unknownReply("zzz"), adminReply.unknownReply("zzz"))
  assert.doesNotMatch(reply.greetReply("Priya"), /[—–]/)
})

test("chat rules agree: titles, previews, ticks, order, unread", () => {
  const me = { id: "me", name: "Louis", last_read_at: "2026-09-23T10:05:00Z" }
  const priya = { id: "p", name: "Priya Thakur", last_read_at: "2026-09-23T10:01:00Z" }
  const convs = [
    { id: "d", kind: "direct", members: [me, priya], unread: 2, muted: false, activity_at: "2026-09-23T10:00:00Z", last_message: { sender_id: "p", kind: "text", body: "hi  there" } },
    { id: "t", kind: "team", team: "sales", title: "Sales team", members: [me, priya], unread: 1, muted: true, activity_at: "2026-09-23T11:00:00Z", last_message: { sender_id: null, kind: "bot", body: "Attendance" } },
    { id: "a", kind: "assistant", members: [me], unread: 0, muted: false, activity_at: "2026-01-01T00:00:00Z", last_message: null },
  ]
  for (const c of convs) {
    assert.equal(chat.conversationTitle(c, "me"), adminChat.conversationTitle(c, "me"))
    assert.equal(chat.previewText(c, "me"), adminChat.previewText(c, "me"))
  }
  assert.deepEqual(chat.sortInbox(convs).map((c) => c.id), adminChat.sortInbox(convs).map((c) => c.id))
  assert.equal(chat.totalUnread(convs), adminChat.totalUnread(convs))
  const msg = { created_at: "2026-09-23T10:00:00Z" }
  assert.equal(chat.tickState(msg, convs[0], "me"), adminChat.tickState(msg, convs[0], "me"))
  assert.equal(chat.tickState(msg, convs[0], "me"), "read")
  assert.equal(chat.attachmentPath("c", "My PO (final).pdf", "u"), adminChat.attachmentPath("c", "My PO (final).pdf", "u"))
})
