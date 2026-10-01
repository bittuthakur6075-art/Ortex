// Which tabs each role sees (src/navigation/tabAccess.ts).

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { tabAllowed } = await loadTs("navigation/tabAccess.ts")
const TABS = ["Home", "Quotes", "Leads", "Products", "Contacts", "TeamTab", "ChatTab"]
const tabs = (profile) => TABS.filter((n) => tabAllowed(profile, n))

test("staff get Home, Team and Chat only, even with a sales grant", () => {
  assert.deepEqual(tabs({ role: "staff", active: true, roleModules: ["products", "customers"] }), ["Home", "TeamTab", "ChatTab"])
})

test("other roles keep the sales tabs and never get Team or Chat tabs", () => {
  assert.deepEqual(tabs({ role: "sales", active: true, roleModules: ["quotations", "customers"] }), ["Home", "Quotes", "Contacts"])
  assert.deepEqual(tabs({ role: "admin", active: true }), ["Home", "Quotes", "Leads", "Products", "Contacts"])
})

test("an inactive staff account gets no tab", () => {
  assert.deepEqual(tabs({ role: "staff", active: false }), [])
})
