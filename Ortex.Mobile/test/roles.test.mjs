// Roles and module access (src/domain/modules.ts).
//
// The phone decides which tabs and screens exist from this one function, and it
// must agree with the console's canAccess and the database's has_module_access()
// (migration 0032). Until 2026-09-19 it returned `Boolean(profile)`, so every
// signed-in user saw every tab; these tests pin the real rule.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { canAccess, isAdmin, isSuperAdmin, roleModulesOf, DEFAULT_ROLE_MODULES, roleLabel } =
  await loadTs("domain/modules.ts")

const p = (over = {}) => ({ id: "u1", active: true, modules: [], ...over })

test("admins and the Super Admin reach every grantable and admin-only module", () => {
  for (const role of ["admin", "super_admin"]) {
    const who = p({ role })
    assert.equal(isAdmin(who), true)
    for (const key of ["quotations", "invoices", "attendance-register", "users"]) {
      assert.equal(canAccess(who, key), true, `${role} ${key}`)
    }
  }
})

test("Super-Admin-only modules refuse an Admin", () => {
  assert.equal(canAccess(p({ role: "super_admin" }), "settings"), true)
  assert.equal(canAccess(p({ role: "admin" }), "settings"), false)
  assert.equal(isSuperAdmin(p({ role: "admin" })), false)
})

test("admin-only modules refuse every other role, even when ticked", () => {
  for (const role of ["accounts", "sales", "staff"]) {
    assert.equal(canAccess(p({ role, modules: ["users"], roleModules: ["users"] }), "users"), false, role)
  }
})

test("a role's grants and a person's extras add up", () => {
  const rep = p({ role: "sales", roleModules: ["quotations"], modules: ["products"] })
  assert.equal(canAccess(rep, "quotations"), true, "from the role")
  assert.equal(canAccess(rep, "products"), true, "their own extra")
  assert.equal(canAccess(rep, "invoices"), false)
})

test("without loaded grants the seed defaults apply", () => {
  assert.deepEqual(roleModulesOf(p({ role: "sales" })), DEFAULT_ROLE_MODULES.sales)
  assert.equal(canAccess(p({ role: "accounts" }), "invoices"), true)
  assert.equal(canAccess(p({ role: "accounts" }), "quotations"), false)
  assert.equal(canAccess(p({ role: "staff" }), "enquiries"), false)
})

test("loaded grants replace the defaults, so the Super Admin can take access away", () => {
  assert.equal(canAccess(p({ role: "sales", roleModules: [] }), "quotations"), false)
})

test("always-on modules reach every active user, Staff included", () => {
  for (const role of ["staff", "accounts", "sales"]) {
    assert.equal(canAccess(p({ role }), "dashboard"), true)
    assert.equal(canAccess(p({ role }), "attendance"), true)
  }
})

test("an inactive account and no account reach nothing", () => {
  assert.equal(canAccess(p({ role: "super_admin", active: false }), "dashboard"), false)
  assert.equal(canAccess(p({ role: "sales", active: false }), "quotations"), false)
  assert.equal(canAccess(null, "dashboard"), false)
})

test("every role has a label", () => {
  for (const role of ["super_admin", "admin", "accounts", "sales", "staff"]) {
    assert.notEqual(roleLabel(role), role)
  }
})
