// Module registry, phone against console: the same keys with the same gates,
// or a role grant opens a screen on one client and not the other.
//
// Console source: MODULES and canAccess in Admin src/data/domain/modules.js,
// loaded directly. The phone keeps no path, section or label parity (its
// labels are its own), only the keys and the flags canAccess reads.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/data/domain/modules.js"))
const mobile = await loadTs("domain/modules.ts")

const FLAGS = ["always", "adminOnly", "superAdminOnly", "payrollOnly"]
const gates = (m) => Object.fromEntries(FLAGS.map((f) => [f, Boolean(m[f])]))

test("both registries hold the same module keys", () => {
  const keys = (list) => list.map((m) => m.key).sort()
  assert.deepEqual(keys(mobile.MODULES), keys(admin.MODULES))
})

test("every key carries the same gates on both clients", () => {
  for (const m of admin.MODULES) {
    const twin = mobile.MODULES.find((x) => x.key === m.key)
    assert.deepEqual(gates(twin), gates(m), m.key)
  }
})

test("an unknown key opens nothing on either client, even for an Admin", () => {
  for (const role of ["admin", "super_admin", "staff"]) {
    const who = { id: "u1", active: true, role, modules: ["no-such-module"] }
    assert.equal(mobile.canAccess(who, "no-such-module"), false, `phone ${role}`)
    assert.equal(admin.canAccess(who, "no-such-module"), false, `console ${role}`)
  }
})

test("canAccess agrees for every key and role", () => {
  for (const role of ["super_admin", "admin", "accounts", "sales", "staff"]) {
    const who = { id: "u1", active: true, role, modules: [] }
    for (const m of admin.MODULES) {
      assert.equal(mobile.canAccess(who, m.key), admin.canAccess(who, m.key), `${role} ${m.key}`)
    }
  }
})
