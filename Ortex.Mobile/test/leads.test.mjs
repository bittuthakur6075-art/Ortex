// The writes a lead takes on the phone match the console's doc shape
// (src/domain/leads.ts, Admin pages/leads/actions.jsx and lib/salesWork.js).

import assert from "node:assert/strict"
import test from "node:test"

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const L = await loadTs("domain/leads.ts")
const S = await loadModule(resolve(dirname(fileURLToPath(import.meta.url)), "../../Ortex.Admin/src/lib/salesWork.js"))
const now = Date.parse("2026-10-03T09:00:00+05:30")
let n = 0
const id = () => `a${++n}`

test("follow-up presets are the console's", () => {
  assert.deepEqual(L.snoozePresets(now), S.snoozePresets(now))
  assert.equal(L.tomorrowAt10(now), S.tomorrowAt10(now))
  assert.ok(Date.parse(L.dayAt10(0, now)) > now, "a picked date is never today or earlier")
})

test("a call on a new lead logs it and moves it to contacted", () => {
  const e = { id: "e1", status: "new", statusAt: { new: "x" }, followUpAt: "2026-10-01T04:30:00.000Z" }
  const p = L.outcomePatch(e, { channel: "call", note: " Wants 500 " }, "Ravi", now, id)
  assert.equal(p.status, "contacted")
  assert.deepEqual(p.statusAt, { new: "x", contacted: new Date(now).toISOString() })
  assert.equal(p.followUpAt, null)
  assert.deepEqual(p.activity.map((a) => [a.type, a.text, a.by]), [["call", "Wants 500", "Ravi"]])
})

test("a follow-up is its own entry; WhatsApp leaves the status alone", () => {
  const e = { id: "e1", status: "contacted", activity: [{ id: "old" }] }
  const at = L.snoozePresets(now).find((p) => p.key === "tomorrow").at
  const p = L.outcomePatch(e, { channel: "whatsapp", followUpAt: at }, "Ravi", now, id)
  assert.equal(p.status, undefined)
  assert.equal(p.followUpAt, at)
  assert.deepEqual(p.activity.map((a) => a.type), [undefined, "whatsapp", "followup"])
  assert.equal(p.activity[0].id, "old")
})

test("lost needs a reason, and a follow-up in the past is refused", () => {
  const e = { id: "e1", status: "qualified" }
  assert.throws(() => L.outcomePatch(e, { channel: "call", status: "lost" }, "", now, id))
  const p = L.outcomePatch(e, { channel: "call", status: "lost", lostReason: "Price too high" }, "", now, id)
  assert.equal(p.lostReason, "Price too high")
  assert.throws(() => L.outcomePatch(e, { channel: "call", followUpAt: new Date(now - 1).toISOString() }, "", now, id))
})

test("status changes stamp statusAt and Undo puts the old fields back", () => {
  const e = { id: "e1", status: "contacted", statusAt: { contacted: "c" }, followUpAt: "f", lostReason: "" }
  assert.deepEqual(L.statusPatch(e, "qualified", "q"), { status: "qualified", followUpAt: null, statusAt: { contacted: "c", qualified: "q" } })
  assert.deepEqual(L.undoPatch(e), { status: "contacted", statusAt: { contacted: "c" }, followUpAt: "f", lostReason: "" })
})
