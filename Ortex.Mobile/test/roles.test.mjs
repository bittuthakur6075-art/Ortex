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

// Migration 0053: the Super Admin's Modules page in the console.
test("a module switched off reaches only the Super Admin", () => {
  const moduleControls = { quotations: { enabled: false, adminAccess: true } }
  assert.equal(canAccess(p({ role: "sales", roleModules: ["quotations"], moduleControls }), "quotations"), false)
  assert.equal(canAccess(p({ role: "admin", moduleControls }), "quotations"), false)
  assert.equal(canAccess(p({ role: "super_admin", moduleControls }), "quotations"), true)
})

test("a module taken off the Admin role needs the Admin's own tick", () => {
  const moduleControls = { invoices: { enabled: true, adminAccess: false } }
  assert.equal(canAccess(p({ role: "admin", moduleControls }), "invoices"), false)
  assert.equal(canAccess(p({ role: "admin", modules: ["invoices"], moduleControls }), "invoices"), true)
  assert.equal(canAccess(p({ role: "admin", moduleControls }), "users"), true)
})

// Migration 0055: the Super Admin can hide a module from one person.
test("a module hidden from a person closes it despite their role", () => {
  assert.equal(canAccess(p({ role: "sales", roleModules: ["quotations"], modules_hidden: ["quotations"] }), "quotations"), false)
  assert.equal(canAccess(p({ role: "admin", modules_hidden: ["invoices"] }), "invoices"), false)
  assert.equal(canAccess(p({ role: "super_admin", modules_hidden: ["invoices"] }), "invoices"), true)
})

// Migration 0067: an Owner plus any number of Super Admins. The phone's copy of
// the console's rules; Ortex.Admin/src/lib/roles.test.js checks every pair against it.
const { assignableRoles, canManageUser, isOwner } = await loadTs("domain/modules.ts")
const PEOPLE = [
  { id: "o", role: "super_admin", is_owner: true },
  { id: "s", role: "super_admin" },
  { id: "s2", role: "super_admin", is_owner: false },
  { id: "a", role: "admin" },
  { id: "a2", role: "admin" },
  { id: "c", role: "accounts" },
  { id: "r", role: "sales" },
  { id: "t", role: "staff" },
]

test("the Owner reads apart and alone hands out Super Admin", () => {
  assert.equal(isOwner(PEOPLE[0]), true)
  assert.equal(isOwner(PEOPLE[1]), false)
  assert.equal(roleLabel(PEOPLE[0]), "Super Admin · Owner")
  assert.equal(roleLabel(PEOPLE[1]), "Super Admin")
  assert.deepEqual(assignableRoles(PEOPLE[0]), ["super_admin", "admin", "accounts", "sales", "staff"])
  assert.deepEqual(assignableRoles(PEOPLE[1]), ["admin", "accounts", "sales", "staff"])
})

test("nobody manages the Owner but the Owner, and only the Owner another Super Admin", () => {
  assert.equal(canManageUser(PEOPLE[1], PEOPLE[0]), false)
  assert.equal(canManageUser(PEOPLE[0], PEOPLE[0]), true)
  assert.equal(canManageUser(PEOPLE[0], PEOPLE[1]), true)
  assert.equal(canManageUser(PEOPLE[2], PEOPLE[1]), false)
  assert.equal(canManageUser(PEOPLE[1], PEOPLE[3]), true)
  assert.equal(canManageUser(PEOPLE[3], PEOPLE[4]), false)
})
