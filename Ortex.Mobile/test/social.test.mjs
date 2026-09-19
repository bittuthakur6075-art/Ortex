// Social posts on the phone (src/domain/social.ts): what blocks a post, which
// list it sits in, and the schedule picker's days and times. The status and
// platform vocabularies are also checked against the console's own copy, because
// both apps write the same `social` rows.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const S = await loadTs("domain/social.ts")

const post = (over = {}) =>
  S.newSocialPost({ topic: "Lanyards", image: "https://x/y.jpg", caption: "Need lanyards?", ...over })

const connected = { meta: { instagram: true, facebook: true }, linkedin: { connected: false } }

test("statuses and platforms match the console", () => {
  const schema = readFileSync(new URL("../../Ortex.Admin/src/data/domain/schema.js", import.meta.url), "utf8")
  for (const s of S.SOCIAL_STATUS) {
    assert.match(schema, new RegExp(`\\{ id: "${s.id}", label: "${s.label}", tone: "${s.tone}" \\}`), s.id)
  }
  for (const p of S.SOCIAL_PLATFORMS) {
    assert.match(schema, new RegExp(`\\{ id: "${p.id}", label: "${p.label}" \\}`), p.id)
  }
})

test("caption and hashtags read as Meta receives them", () => {
  assert.equal(S.captionText({ caption: " Hi ", hashtags: ["a", "#b"] }), "Hi\n\n#a #b")
  assert.deepEqual(S.parseHashtags("#lanyards, corporategifts  #idcards"), ["lanyards", "corporategifts", "idcards"])
})

test("a post says what blocks it", () => {
  assert.equal(S.problemWith(post(), connected), "")
  assert.equal(S.problemWith(post({ image: "" }), connected), "Add a photo first.")
  assert.equal(S.problemWith(post({ platforms: [] }), connected), "Choose at least one platform.")
  assert.match(S.problemWith(post({ platforms: ["linkedin"] }), connected), /LinkedIn is not connected/)
  assert.match(S.problemWith(post({ hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`) }), connected), /30 hashtags/)
  // Not loaded yet: do not block on it, the server checks again.
  assert.equal(S.problemWith(post({ platforms: ["linkedin"] }), null), "")
})

test("each status lands in one tab", () => {
  assert.equal(S.tabOf("review"), "review")
  assert.equal(S.tabOf("failed"), "review")
  assert.equal(S.tabOf("scheduled"), "scheduled")
  assert.equal(S.tabOf("publishing"), "scheduled")
  assert.equal(S.tabOf("idea"), "drafts")
  assert.equal(S.tabOf("published"), "published")
})

test("scheduled posts sort by when they go out", () => {
  const list = [
    { id: "b", ...post({ scheduledFor: "2026-09-22T10:00:00.000Z" }) },
    { id: "a", ...post({ scheduledFor: "2026-09-20T10:00:00.000Z" }) },
  ]
  assert.deepEqual(S.sortForTab(list, "scheduled").map((p) => p.id), ["a", "b"])
})

test("schedule picker: 14 days from today, times with room before the sweep", () => {
  const now = new Date(2026, 8, 19, 17, 5) // 19 Sep, 5:05 pm local
  const days = S.scheduleDays(now)
  assert.equal(days.length, 14)
  assert.equal(days[0].label, "Today")
  assert.equal(days[1].label, "Tomorrow")
  assert.equal(days[0].key, "2026-09-19")

  const today = S.scheduleTimes(days[0].date, now)
  assert.equal(today[0].key, "17:30") // 17:00 is gone, 17:30 is 25 minutes away
  assert.equal(today.at(-1).key, "22:30")
  assert.equal(S.scheduleTimes(days[1].date, now)[0].key, "07:00")
})
