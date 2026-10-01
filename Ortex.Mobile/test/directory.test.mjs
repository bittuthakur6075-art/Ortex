// The Customers list, the pure half (src/features/contacts/directory.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const d = await loadTs("features/contacts/directory.ts")

const NOW = Date.parse("2026-10-01T12:00:00Z")
const ago = (days) => new Date(NOW - days * 86400000).toISOString()
const people = [
  { id: "a", name: "Asha Rao", company: "Zenith Prints", phone: "+91 98450 11111", email: "asha@zenith.in", city: "Pune" },
  { id: "b", name: "bharat", company: "", phone: "", email: "b@x.in" },
  { id: "c", name: "", company: "9to5 Gifts", phone: "09845022222", email: "" },
  { id: "z", name: "Zoya", company: "Acme", phone: "9845033333", email: "" },
]

const activity = d.activityIndex(
  people,
  [
    { customer: { email: "ASHA@zenith.in" }, status: "sent", issueDate: ago(40) },
    { customer: { phone: "919845022222" }, status: "accepted", issueDate: ago(5) },
    { customer: { name: "Asha Rao" }, status: "draft", issueDate: ago(1) }, // name only: never matched
  ],
  [{ customer: { phone: "98450 33333" }, createdAt: ago(2) }],
)

test("business is matched by email, then national phone digits, never by name", () => {
  assert.deepEqual(activity.get("a"), { open: 1, lastAt: Date.parse(ago(40)) })
  assert.deepEqual(activity.get("c"), { open: 0, lastAt: Date.parse(ago(5)) })
  assert.equal(activity.get("z").lastAt, Date.parse(ago(2)))
  assert.equal(activity.get("b"), undefined)
})

test("search covers city and phone without +91 or a leading 0", () => {
  assert.ok(d.matches(people[0], "pune"))
  assert.ok(d.matches(people[0], "98450 111"))
  assert.ok(d.matches(people[2], "+91 98450 22"))
  assert.ok(!d.matches(people[1], "98"))
})

test("an unmatched search carries into the right field", () => {
  assert.deepEqual(d.prefillFromQuery(" a@b.in "), { email: "a@b.in" })
  assert.deepEqual(d.prefillFromQuery("+91 98450 12345"), { phone: "+91 98450 12345" })
  assert.deepEqual(d.prefillFromQuery("Rao 2"), { name: "Rao 2" })
})

const build = (over) =>
  d.buildSections(people, { needle: "", sort: "name", filter: "all", favourites: new Set(["z"]), activity, now: NOW, ...over })

test("All: favourites pinned above A-Z, # last, case-insensitive", () => {
  const { sections, total } = build()
  assert.equal(total, 4)
  assert.deepEqual(sections.map((s) => s.letter), ["★", "A", "B", "Z", "#"])
  assert.deepEqual(sections[0].data.map((c) => c.id), ["z"])
})

test("a search drops the favourites copy", () => {
  assert.deepEqual(build({ needle: "zo" }).sections.map((s) => s.letter), ["Z"])
})

test("filters", () => {
  const ids = (f) => build({ filter: f }).sections.flatMap((s) => s.data.map((c) => c.id))
  assert.deepEqual(ids("open"), ["a"])
  assert.deepEqual(ids("nophone"), ["b"])
  assert.deepEqual(ids("favourites"), ["z"])
  // Recent is one section, newest first; Asha's quote is 40 days old.
  assert.deepEqual(build({ filter: "recent" }).sections.map((s) => s.letter), ["Last 30 days"])
  assert.deepEqual(ids("recent"), ["z", "c"])
})

test("sort by company letters on the company", () => {
  assert.deepEqual(build({ sort: "company", favourites: new Set() }).sections.map((s) => s.letter), ["A", "B", "Z", "#"])
})
